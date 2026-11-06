let audioContext: AudioContext | null = null;

const SOUND_KEY = 'delineate-sound';
const HAPTIC_KEY = 'delineate-haptics';
const readFlag = (key: string) => {
  try {
    return window.localStorage.getItem(key) !== 'off';
  } catch {
    return true;
  }
};
let soundOn = readFlag(SOUND_KEY);
let hapticsOn = readFlag(HAPTIC_KEY);

export const isSoundOn = () => soundOn;
export const isHapticsOn = () => hapticsOn;
const store = (key: string, value: boolean) => {
  try {
    window.localStorage.setItem(key, value ? 'on' : 'off');
  } catch {
    /* storage blocked: setting lasts for this visit only */
  }
};
export function setSoundOn(value: boolean) {
  soundOn = value;
  store(SOUND_KEY, value);
}
export function setHapticsOn(value: boolean) {
  hapticsOn = value;
  store(HAPTIC_KEY, value);
}

/** Vibrate on phones that support it (Android). Silently ignored elsewhere. */
export function haptic(pattern: number | number[] = 8) {
  if (!hapticsOn) return;
  try {
    navigator.vibrate?.(pattern);
  } catch {
    /* unsupported */
  }
}

function context() {
  if (!audioContext) {
    audioContext = new (window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
  }
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

// Every sound goes through here so the global mute and missing audio support are handled once.
function play(build: (ctx: AudioContext) => void) {
  if (!soundOn) return;
  try {
    build(context());
  } catch {
    // Audio is an enhancement; the app should still work silently.
  }
}

function noise(
  ctx: AudioContext,
  duration: number,
  volume: number,
  type: BiquadFilterType = 'highpass',
  frequency = 1800,
  delay = 0,
) {
  const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * duration), ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let i = 0; i < channel.length; i += 1) {
    channel[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / channel.length, 2);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = frequency;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(ctx.currentTime + delay);
}

function tone(
  ctx: AudioContext,
  frequency: number,
  duration: number,
  volume: number,
  type: OscillatorType = 'sine',
  delay = 0,
  endFrequency?: number,
) {
  const t = ctx.currentTime + delay;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(frequency, t);
  if (endFrequency) osc.frequency.exponentialRampToValueAtTime(endFrequency, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Each camera body has its own voice. */
export type Voice = 'mech' | 'plastic' | 'motor' | 'digital' | 'leaf' | 'soft';

export const playShutter = (voice: Voice = 'mech') =>
  play((ctx) => {
    if (voice === 'mech') {
      // focal-plane cloth shutter: mirror slap + two curtain clacks
      noise(ctx, 0.05, 0.22);
      tone(ctx, 160, 0.08, 0.07, 'square', 0, 60);
      noise(ctx, 0.06, 0.14, 'highpass', 1600, 0.09);
    } else if (voice === 'plastic') {
      noise(ctx, 0.03, 0.18, 'bandpass', 2400);
      tone(ctx, 900, 0.03, 0.03, 'square', 0, 400);
      tone(ctx, 2600, 0.12, 0.012, 'sine', 0.03, 1800); // cheap spring ring
    } else if (voice === 'motor') {
      noise(ctx, 0.04, 0.2, 'bandpass', 1800);
      tone(ctx, 120, 0.9, 0.025, 'sawtooth', 0.08, 180); // eject motor whirr
      noise(ctx, 0.9, 0.03, 'bandpass', 700, 0.08);
    } else if (voice === 'digital') {
      tone(ctx, 1500, 0.05, 0.03, 'square');
      noise(ctx, 0.08, 0.16, 'highpass', 3000, 0.05); // recorded "fake" shutter
      noise(ctx, 0.05, 0.1, 'highpass', 2500, 0.16);
    } else if (voice === 'leaf') {
      noise(ctx, 0.015, 0.14, 'bandpass', 5200);
      tone(ctx, 3800, 0.02, 0.01, 'square', 0.01);
    } else {
      tone(ctx, 220, 0.06, 0.05, 'sine', 0, 90);
      noise(ctx, 0.03, 0.06, 'lowpass', 1200);
    }
  });

/** Second curtain closing at the end of a long exposure. */
export const playClose = (voice: Voice = 'mech') =>
  play((ctx) => (voice === 'digital' || voice === 'soft' ? tone(ctx, 1200, 0.05, 0.03, 'square') : noise(ctx, 0.05, 0.16, 'highpass', 1700)));

/** What happens after the shot: lever ratchet, thumbwheel, print eject, save beep… */
export const playAdvance = (voice: Voice = 'mech') =>
  play((ctx) => {
    if (voice === 'mech') for (let i = 0; i < 6; i += 1) noise(ctx, 0.018, 0.07, 'bandpass', 2600, 0.12 + i * 0.045);
    else if (voice === 'plastic') for (let i = 0; i < 10; i += 1) noise(ctx, 0.012, 0.09, 'bandpass', 3400, 0.25 + i * 0.07);
    else if (voice === 'digital') tone(ctx, 2400, 0.08, 0.02, 'square', 0.35);
    else if (voice === 'leaf') for (let i = 0; i < 3; i += 1) noise(ctx, 0.02, 0.05, 'bandpass', 2200, 0.15 + i * 0.08);
    else if (voice === 'soft') tone(ctx, 880, 0.12, 0.015, 'sine', 0.1);
  });

export const playTick = (high = false) => play((ctx) => tone(ctx, high ? 880 : 520, 0.09, 0.035));

/** Knob detent click. */
export const playDetent = () =>
  play((ctx) => {
    noise(ctx, 0.012, 0.09, 'bandpass', 3800);
    tone(ctx, 1400, 0.02, 0.01, 'square');
  });

/** Soft UI tap for buttons. */
export const playTap = () => play((ctx) => tone(ctx, 660, 0.04, 0.012, 'triangle'));

/** Autofocus confirmation beep (double chirp like a digicam). */
export const playFocus = () =>
  play((ctx) => {
    tone(ctx, 2200, 0.05, 0.03, 'square');
    tone(ctx, 2200, 0.05, 0.03, 'square', 0.07);
  });

export const playPour = (seconds = 1.2) =>
  play((ctx) => {
    for (let i = 0; i < seconds * 8; i += 1)
      noise(ctx, 0.25, 0.05 + Math.random() * 0.03, 'lowpass', 900 + Math.random() * 900, i * 0.12);
  });

export const playSlosh = () =>
  play((ctx) => noise(ctx, 0.35, 0.09, 'lowpass', 500 + Math.random() * 300));

export const playHum = (seconds: number) =>
  play((ctx) => tone(ctx, 110, seconds, 0.02, 'sawtooth'));

export const playSuccess = () =>
  play((ctx) => {
    [523, 659, 784, 1046].forEach((f, i) => tone(ctx, f, 0.25, 0.04, 'triangle', i * 0.09));
  });

export const playPaper = () => play((ctx) => noise(ctx, 0.18, 0.08, 'bandpass', 3000));

export const playPop = () => play((ctx) => tone(ctx, 300, 0.12, 0.06, 'sine', 0, 900));

export const playFlip = () =>
  play((ctx) => {
    noise(ctx, 0.25, 0.06, 'bandpass', 1500);
    noise(ctx, 0.1, 0.05, 'highpass', 4000, 0.15);
  });

export const playFlashCharge = () =>
  play((ctx) => tone(ctx, 1800, 0.6, 0.015, 'sine', 0, 6000));
