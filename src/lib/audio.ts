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
let clickyOn = readFlag('delineate-clicky');

/** Button sound packs (Customise → Sound). */
export type SoundPack = 'classic' | 'retro' | 'modern' | 'typewriter' | 'bubble' | 'wood';
export const SOUND_PACKS: { id: SoundPack; label: string; note: string }[] = [
  { id: 'classic', label: 'Classic', note: 'Soft triangle tap' },
  { id: 'retro', label: 'Retro', note: '8-bit console blip' },
  { id: 'modern', label: 'Modern', note: 'Crisp glass click' },
  { id: 'typewriter', label: 'Typewriter', note: 'Mechanical key clack' },
  { id: 'bubble', label: 'Bubble', note: 'Round little pop' },
  { id: 'wood', label: 'Wooden', note: 'Hollow wood knock' },
];
const PACK_KEY = 'delineate-sound-pack';
let pack: SoundPack = (() => {
  try {
    const saved = window.localStorage.getItem(PACK_KEY) as SoundPack | null;
    return saved && SOUND_PACKS.some((p) => p.id === saved) ? saved : 'classic';
  } catch {
    return 'classic';
  }
})();

export const isSoundOn = () => soundOn;
export const isHapticsOn = () => hapticsOn;
export const isClickyOn = () => clickyOn;
export const getSoundPack = () => pack;
const store = (key: string, value: boolean) => {
  try {
    window.localStorage.setItem(key, value ? 'on' : 'off');
  } catch {
    /* storage blocked: setting lasts for this visit only */
  }
};
/** Detent clicks + buzz while dragging tactile faders and knobs. */
export function setClickyOn(value: boolean) {
  clickyOn = value;
  store('delineate-clicky', value);
}
export function setSoundPack(value: SoundPack) {
  pack = value;
  try {
    window.localStorage.setItem(PACK_KEY, value);
  } catch {
    /* storage blocked */
  }
}
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
export type Voice =
  | 'mech' | 'plastic' | 'motor' | 'digital' | 'leaf' | 'soft'
  | 'phone' | 'iphone' | 'compact' | 'tape' | 'chip' | 'booth' | 'sx70' | 'motor35' | 'cloth';

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
    } else if (voice === 'phone') {
      // the recorded "ka-chik" camera phones played from a tiny speaker
      noise(ctx, 0.05, 0.2, 'bandpass', 3200);
      noise(ctx, 0.07, 0.16, 'bandpass', 2600, 0.11);
      tone(ctx, 1800, 0.04, 0.02, 'square', 0.11, 900);
    } else if (voice === 'iphone') {
      // two-part iris close/open
      noise(ctx, 0.06, 0.18, 'bandpass', 2200);
      tone(ctx, 420, 0.05, 0.03, 'triangle', 0, 200);
      noise(ctx, 0.06, 0.12, 'bandpass', 2800, 0.13);
      tone(ctx, 260, 0.05, 0.02, 'triangle', 0.13, 520);
    } else if (voice === 'compact') {
      // AF confirm beep-beep, then the sampled shutter
      tone(ctx, 2100, 0.05, 0.03, 'square');
      tone(ctx, 2100, 0.05, 0.03, 'square', 0.08);
      noise(ctx, 0.07, 0.16, 'highpass', 2800, 0.18);
    } else if (voice === 'tape') {
      // camcorder photo button: relay clunk + a short motor whirr
      noise(ctx, 0.05, 0.2, 'lowpass', 900);
      tone(ctx, 90, 0.35, 0.03, 'sawtooth', 0.04, 140);
      tone(ctx, 1600, 0.06, 0.015, 'sine', 0.3);
    } else if (voice === 'chip') {
      tone(ctx, 1046, 0.05, 0.04, 'square');
      tone(ctx, 1568, 0.05, 0.04, 'square', 0.05);
      noise(ctx, 0.08, 0.1, 'highpass', 4000, 0.1);
    } else if (voice === 'booth') {
      tone(ctx, 1320, 0.12, 0.02, 'sine');
      noise(ctx, 0.12, 0.14, 'bandpass', 2400, 0.02);
    } else if (voice === 'sx70') {
      noise(ctx, 0.04, 0.24, 'bandpass', 1500);
      tone(ctx, 95, 1.4, 0.03, 'sawtooth', 0.06, 150); // the famous long eject whirr
      noise(ctx, 1.4, 0.035, 'bandpass', 600, 0.06);
    } else if (voice === 'motor35') {
      noise(ctx, 0.02, 0.12, 'bandpass', 4200);
      tone(ctx, 180, 0.45, 0.02, 'sawtooth', 0.05, 240); // auto wind
    } else if (voice === 'cloth') {
      noise(ctx, 0.03, 0.1, 'bandpass', 1400);
      noise(ctx, 0.03, 0.07, 'bandpass', 1900, 0.04);
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
    else if (voice === 'phone' || voice === 'compact') tone(ctx, 1760, 0.06, 0.015, 'square', 0.3);
    else if (voice === 'chip') [523, 659, 784].forEach((f, i) => tone(ctx, f, 0.06, 0.03, 'square', 0.15 + i * 0.06));
    else if (voice === 'cloth') for (let i = 0; i < 4; i += 1) noise(ctx, 0.016, 0.05, 'bandpass', 2400, 0.1 + i * 0.05);
  });

/** Button voices: each body's keys sound like its keys. */
export type KeySound = 'dtmf' | 'beep' | 'click' | 'chip' | 'soft' | 'clunk' | 'glass';
const DTMF: Record<string, [number, number]> = {
  '1': [697, 1209], '2': [697, 1336], '3': [697, 1477], '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
  '7': [852, 1209], '8': [852, 1336], '9': [852, 1477], '*': [941, 1209], '0': [941, 1336], '#': [941, 1477],
};
export const playKey = (kind: KeySound, key = '') =>
  play((ctx) => {
    if (kind === 'dtmf') {
      const [a, b] = DTMF[key] ?? [941, 1633];
      tone(ctx, a, 0.09, 0.025);
      tone(ctx, b, 0.09, 0.025);
    } else if (kind === 'beep') tone(ctx, 2300, 0.05, 0.025, 'square');
    else if (kind === 'click') {
      noise(ctx, 0.014, 0.1, 'bandpass', 3200);
      tone(ctx, 1100, 0.015, 0.008, 'square');
    } else if (kind === 'chip') tone(ctx, 880, 0.04, 0.03, 'square', 0, 1320);
    else if (kind === 'clunk') {
      noise(ctx, 0.04, 0.16, 'lowpass', 700);
      tone(ctx, 110, 0.05, 0.04, 'triangle');
    } else if (kind === 'glass') tone(ctx, 2600, 0.03, 0.012, 'sine');
    else tone(ctx, 640, 0.05, 0.02, 'sine');
  });

export const playTick = (high = false) => play((ctx) => tone(ctx, high ? 880 : 520, 0.09, 0.035));

/** Knob detent click. */
export const playDetent = () =>
  play((ctx) => {
    noise(ctx, 0.012, 0.09, 'bandpass', 3800);
    tone(ctx, 1400, 0.02, 0.01, 'square');
  });

/** UI tap for buttons, in the chosen sound pack (pass one to preview it). */
export const playTap = (which: SoundPack = pack) =>
  play((ctx) => {
    if (which === 'retro') {
      tone(ctx, 988, 0.035, 0.03, 'square');
      tone(ctx, 1319, 0.04, 0.025, 'square', 0.035);
    } else if (which === 'modern') {
      noise(ctx, 0.008, 0.08, 'highpass', 6000);
      tone(ctx, 2400, 0.018, 0.012, 'sine');
    } else if (which === 'typewriter') {
      noise(ctx, 0.022, 0.2, 'bandpass', 2200);
      tone(ctx, 180, 0.03, 0.05, 'square', 0, 90);
    } else if (which === 'bubble') {
      tone(ctx, 420, 0.07, 0.05, 'sine', 0, 1100);
    } else if (which === 'wood') {
      tone(ctx, 320, 0.06, 0.07, 'triangle', 0, 240);
      noise(ctx, 0.015, 0.06, 'bandpass', 1200);
    } else {
      tone(ctx, 660, 0.04, 0.012, 'triangle');
    }
  });

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
