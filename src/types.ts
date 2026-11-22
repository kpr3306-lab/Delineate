import type { Adv } from './lib/darkroom';
export type Look = {
  brightness: number;
  contrast: number;
  saturation: number;
  sepia: number;
  hue: number;
  warmth: number;
  tint: number;
  fade: number;
  grain: number;
  vignette: number;
  blur: number;
  lightLeak: number;
  scanlines: number;
  tone: string | null;
  toneAmount: number;
  /** Split toning: colour pushed into shadows / highlights. */
  shadowTint?: string | null;
  highlightTint?: string | null;
  split?: number;
  /** -100..100 tone recovery / lift; 0..100 unsharp mask. Optional so older saves still load. */
  highlights?: number;
  shadows?: number;
  sharpen?: number;
  grainSize?: GrainSize;
};

export type GrainSize = 'fine' | 'medium' | 'coarse';

export type FrameStyle =
  | 'none'
  | 'film35'
  | 'polaroid'
  | 'instax'
  | 'medium'
  | 'mat'
  | 'wood'
  | 'gold'
  | 'tape'
  | 'sx70'
  | 'deckle'
  | 'float'
  | 'slide'
  | 'stamp'
  | 'airmail'
  | 'modern'
  | 'blackmat'
  | 'negative'
  | 'dated'
  | 'corners'
  | 'scallop'
  | 'linen'
  | 'torn'
  | 'caption'
  | 'fineart'
  | 'boothstrip'
  | 'washi';

export type StampStyle = 'none' | 'date' | 'led' | 'lcd' | 'dymo' | 'ink' | 'editorial' | 'camcorder' | 'rec';
export type StampCorner = 'br' | 'bl' | 'tr' | 'tl';

export type Effects = {
  motionBlur: number;
  vignette: number;
  halation: number;
  fisheye: number;
  flash: number;
  stamp: StampStyle;
  /** Corner for the corner-anchored stamps; colour override (null = the style's own); date override (null = when the photo was taken). */
  stampPos: StampCorner;
  stampColor: string | null;
  stampDate: number | null;
  /** Handwritten line on frames that have room for one (Polaroid, Instax, SX-70, slide, airmail, deckle). */
  caption: string;
  doubleId: string | null;
  doubleMix: number;
  border: FrameStyle;
  /** 4:3 and 16:9 follow the photo's orientation; 4:5 is always portrait, 2.39 always wide. */
  aspect: CropAspect;
  /** Width ÷ height of a hand-drawn crop, used when aspect is 'free'. */
  cropRatio?: number;
  /** Crop geometry: quarter turns, mirror, fine straighten (deg), zoom, and pan (-1..1 of the slack). */
  rotate: number;
  flip: boolean;
  straighten: number;
  zoom: number;
  cropX: number;
  cropY: number;
  dust: number;
  scratches: number;
  booth: boolean;
  boothIds: string[];
  mist: number;
  starburst: number;
  flare: number;
  leak: number;
  trails: number;
  zoomBurst: number;
  gateWeave: number;
  infrared: number;
  crossProcess: number;
  bleach: number;
  solarize: number;
  negative: number;
  thermal: number;
  rgbSplit: number;
  miniDv: number;
  videoGrain: number;
  crt: number;
  glitch: number;
  softVignette: number;
  anamorphic: number;
};

export type CropAspect = 'original' | '1:1' | '4:3' | '4:5' | '16:9' | '2.39' | 'free';

export type ProcessConfig = {
  presetId: string;
  look: Look;
  effects: Effects;
};

export type PhotoKind = 'still' | 'art' | 'animated' | 'collage';

export type PhotoRecord = {
  id: string;
  name: string;
  createdAt: number;
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  filterName: string;
  kind: PhotoKind;
  note?: string;
  /** false = still a latent negative waiting in the Develop tab. undefined = developed (old records). */
  developed?: boolean;
  /** Unprocessed source kept so Processing settings can be re-edited later. */
  original?: Blob;
  process?: ProcessConfig;
  /** Advanced darkroom edit record; `original` holds the untouched source. */
  darkroom?: Adv;
  /** The capture without its camera body's look (resolution, pixel pass, imprint, print frame), for "Strip cam effects". */
  camRaw?: Blob;
  camera?: string;
  /** Process is editing from camRaw instead of the camera's own look. */
  camStripped?: boolean;
  favorite?: boolean;
  /** Where it was shot, only when the user turned on location tags. */
  place?: { lat: number; lon: number; acc?: number };
};

/** A user-saved Process preset (look + effects minus anything tied to one photo). */
export type UserPreset = {
  id: string;
  name: string;
  createdAt: number;
  favorite: boolean;
  look: Look;
  effects: Partial<Effects>;
};

export type EditTarget = {
  record?: PhotoRecord;
  blob: Blob;
  fileName: string;
};

export type AspectKey = '4:3' | '1:1' | '3:4' | '16:9' | '3:2' | '2:3' | '8:7' | '65:24';

export const ASPECTS: Record<AspectKey, number> = {
  '4:3': 4 / 3,
  '1:1': 1,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
  '3:2': 3 / 2,
  '2:3': 2 / 3,
  '8:7': 8 / 7,
  '65:24': 65 / 24,
};

/* Journal ------------------------------------------------------------------ */

export type PaperKind =
  | 'plain'
  | 'lined'
  | 'grid'
  | 'dots'
  | 'kraft'
  | 'watercolor'
  | 'gingham'
  | 'parchment'
  | 'newsprint'
  | 'linen'
  | 'blueprint';

export type JItemBase = { id: string; x: number; y: number; w: number; h: number; r: number };

export type JItem =
  | (JItemBase & {
      type: 'text';
      text: string;
      font: 'serif' | 'sans' | 'mono' | 'hand';
      size: number;
      color: string;
      align: 'left' | 'center' | 'right';
      label: 'none' | 'highlight' | 'tape' | 'tag';
    })
  | (JItemBase & {
      type: 'photo';
      photoId: string | null;
      style: 'plain' | 'polaroid' | 'tape' | 'round' | 'circle' | 'film' | 'stamp' | 'shadow';
    })
  | (JItemBase & { type: 'deco'; deco: string; color: string })
  | (JItemBase & {
      type: 'doodle';
      points: number[];
      vw: number;
      vh: number;
      color: string;
      width: number;
      alpha: number;
    });

export type JPage = {
  id: string;
  bg: string;
  paper: PaperKind;
  items: JItem[];
  /** Optional full-page photo behind everything, washed with the page colour by `bgFade` (0–0.9). */
  bgPhoto?: Blob;
  bgFade?: number;
};

export type JournalBook = {
  id: string;
  title: string;
  themeId: string;
  cover: string;
  createdAt: number;
  updatedAt: number;
  pages: JPage[];
};

/* Memories: albums, time capsules, memory walls and yearbooks share one local store ------------- */

export type Album = { id: string; type: 'album'; name: string; photoIds: string[]; coverId?: string; createdAt: number; updatedAt: number };
export type Capsule = {
  id: string;
  type: 'capsule';
  name: string;
  note: string;
  photoIds: string[];
  sealedAt: number;
  /** Opens at local midnight starting this day (ms). */
  openAt: number;
  openedAt?: number;
  createdAt: number;
  updatedAt: number;
};
export type WallItem = {
  id: string;
  kind: 'photo' | 'note' | 'date' | 'ticket';
  /** Position and size as fractions of the board, rotation in degrees. */
  x: number;
  y: number;
  w: number;
  r: number;
  photoId?: string;
  text?: string;
  color?: string;
  z: number;
};
export type Wall = { id: string; type: 'wall'; name: string; surface: 'cork' | 'linen' | 'slate' | 'paper'; items: WallItem[]; createdAt: number; updatedAt: number };
export type Yearbook = { id: string; type: 'yearbook'; year: number; title: string; subtitle: string; photoIds: string[]; coverId?: string; createdAt: number; updatedAt: number };
export type Collection = Album | Capsule | Wall | Yearbook;
