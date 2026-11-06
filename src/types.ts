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
};

export type FrameStyle =
  | 'none'
  | 'film35'
  | 'polaroid'
  | 'instax'
  | 'medium'
  | 'mat'
  | 'wood'
  | 'gold'
  | 'tape';

export type StampStyle = 'none' | 'date' | 'camcorder';

export type Effects = {
  motionBlur: number;
  vignette: number;
  halation: number;
  fisheye: number;
  flash: number;
  stamp: StampStyle;
  doubleId: string | null;
  doubleMix: number;
  border: FrameStyle;
  aspect: 'original' | '4:3' | '1:1';
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
  favorite?: boolean;
};

export type EditTarget = {
  record?: PhotoRecord;
  blob: Blob;
  fileName: string;
};

export type AspectKey = '4:3' | '1:1' | '3:4' | '16:9';

export const ASPECTS: Record<AspectKey, number> = {
  '4:3': 4 / 3,
  '1:1': 1,
  '3:4': 3 / 4,
  '16:9': 16 / 9,
};

/* Journal ------------------------------------------------------------------ */

export type PaperKind = 'plain' | 'lined' | 'grid' | 'dots' | 'kraft' | 'watercolor';

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
      style: 'plain' | 'polaroid' | 'tape' | 'round' | 'circle';
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

export type JPage = { id: string; bg: string; paper: PaperKind; items: JItem[] };

export type JournalBook = {
  id: string;
  title: string;
  themeId: string;
  cover: string;
  createdAt: number;
  updatedAt: number;
  pages: JPage[];
};
