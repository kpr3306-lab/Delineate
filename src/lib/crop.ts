// Crop geometry, kept free of canvas code so `node scripts/crop.check.ts` can test it.
import type { Effects } from '../types';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const quarterTurns = (rotate: number) => ((Math.round(rotate / 90) % 4) + 4) % 4;

/**
 * Crop geometry: how big the photo is drawn and how far it can pan, for a w×h output.
 * The output rect, tilted by the straighten angle, always stays inside the photo (no empty corners).
 */
export function cropFit(sw: number, sh: number, e: Effects, w: number, h: number) {
  const [rw, rh] = quarterTurns(e.rotate) % 2 ? [sh, sw] : [sw, sh];
  const t = (clamp(e.straighten, -45, 45) * Math.PI) / 180;
  const cos = Math.abs(Math.cos(t));
  const sin = Math.abs(Math.sin(t));
  const bw = w * cos + h * sin;
  const bh = w * sin + h * cos;
  const scale = Math.max(bw / rw, bh / rh) * clamp(e.zoom || 1, 1, 4);
  // pan slack, in output pixels, on each side
  return { t, scale, slackX: Math.max(0, (rw * scale - bw) / 2), slackY: Math.max(0, (rh * scale - bh) / 2) };
}

/**
 * What the current crop shows, in rotated-source pixels: centre, size, and the photo's own size.
 * `aspect` is the output's width ÷ height (processedAspect).
 */
export function cropView(sw: number, sh: number, e: Effects, aspect: number) {
  const [rw, rh] = quarterTurns(e.rotate) % 2 ? [sh, sw] : [sw, sh];
  const f = cropFit(sw, sh, e, aspect, 1);
  return {
    rw,
    rh,
    vw: aspect / f.scale,
    vh: 1 / f.scale,
    cx: rw / 2 + (clamp(e.cropX, -1, 1) * f.slackX) / f.scale,
    cy: rh / 2 + (clamp(e.cropY, -1, 1) * f.slackY) / f.scale,
  };
}

/**
 * A crop window drawn over the current crop (fractions of it, may reach past it up to the photo's edge)
 * turned back into crop settings: shape, zoom and pan. Straighten is treated as level (close enough for a few degrees).
 */
export function cropFromBox(sw: number, sh: number, e: Effects, aspect: number, box: { x0: number; y0: number; x1: number; y1: number }, lockAspect: boolean) {
  const v = cropView(sw, sh, e, aspect);
  const left = v.cx - v.vw / 2 + box.x0 * v.vw;
  const top = v.cy - v.vh / 2 + box.y0 * v.vh;
  let w = Math.min((box.x1 - box.x0) * v.vw, v.rw);
  let h = Math.min((box.y1 - box.y0) * v.vh, v.rh);
  if (lockAspect) {
    w = Math.min(w, h * aspect);
    h = w / aspect;
  }
  const cx = clamp(left + ((box.x1 - box.x0) * v.vw) / 2, w / 2, v.rw - w / 2);
  const cy = clamp(top + ((box.y1 - box.y0) * v.vh) / 2, h / 2, v.rh - h / 2);
  const ratio = w / h;
  const base = cropFit(sw, sh, { ...e, zoom: 1 }, ratio, 1).scale;
  const zoom = clamp(1 / h / base, 1, 4);
  const f = cropFit(sw, sh, { ...e, zoom }, ratio, 1);
  return {
    ratio,
    zoom,
    cropX: f.slackX ? clamp(((cx - v.rw / 2) * f.scale) / f.slackX, -1, 1) : 0,
    cropY: f.slackY ? clamp(((cy - v.rh / 2) * f.scale) / f.slackY, -1, 1) : 0,
  };
}
