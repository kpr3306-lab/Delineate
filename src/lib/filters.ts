import type { Look } from '../types';
import { clamp } from './utils';

export const BASE_LOOK: Look = {
  brightness: 1,
  contrast: 1,
  saturation: 1,
  sepia: 0,
  hue: 0,
  warmth: 0,
  tint: 0,
  fade: 0,
  grain: 0,
  vignette: 0,
  blur: 0,
  lightLeak: 0,
  scanlines: 0,
  tone: null,
  toneAmount: 0,
  shadowTint: null,
  highlightTint: null,
  split: 0,
};

export function lookToCss(look: Look) {
  return [
    `brightness(${clamp(look.brightness, 0.2, 1.8)})`,
    `contrast(${clamp(look.contrast, 0.2, 2)})`,
    `saturate(${clamp(look.saturation, 0, 2.4)})`,
    `sepia(${clamp(look.sepia, 0, 1)})`,
    `hue-rotate(${look.hue}deg)`,
    `blur(${clamp(look.blur, 0, 8)}px)`,
  ].join(' ');
}

export function warmthColor(value: number) {
  return value >= 0
    ? `rgba(255, 138, 48, ${clamp(value / 100, 0, 1) * 0.42})`
    : `rgba(80, 143, 255, ${clamp(Math.abs(value) / 100, 0, 1) * 0.34})`;
}

export function tintColor(value: number) {
  return value >= 0
    ? `rgba(126, 255, 168, ${clamp(value / 100, 0, 1) * 0.28})`
    : `rgba(255, 87, 178, ${clamp(Math.abs(value) / 100, 0, 1) * 0.28})`;
}

export function createEditedLook(base: Look, overrides: Partial<Look>): Look {
  return { ...base, ...overrides };
}
