// Self-check for the crop box maths: a drawn box must come back as the same visible region.
import assert from 'node:assert/strict';
import { cropFromBox, cropView } from '../src/lib/crop.ts';
import type { Effects } from '../src/types.ts';

const base = { rotate: 0, flip: false, straighten: 0, zoom: 1, cropX: 0, cropY: 0 } as Effects;
const near = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: ${a} vs ${b}`);

// 4000×3000 photo, full frame (aspect 4/3): draw the right-hand half
{
  const r = cropFromBox(4000, 3000, base, 4 / 3, { x0: 0.5, y0: 0, x1: 1, y1: 1 }, false);
  near(r.ratio, 2000 / 3000, 'half-width ratio');
  const v = cropView(4000, 3000, { ...base, zoom: r.zoom, cropX: r.cropX, cropY: r.cropY }, r.ratio);
  near(v.vw, 2000, 'visible width');
  near(v.vh, 3000, 'visible height');
  near(v.cx, 3000, 'centre x');
}

// a centred quarter box, aspect locked: zoom 2, no pan
{
  const r = cropFromBox(4000, 3000, base, 4 / 3, { x0: 0.25, y0: 0.25, x1: 0.75, y1: 0.75 }, true);
  near(r.zoom, 2, 'zoom');
  near(r.cropX, 0, 'pan x');
  near(r.cropY, 0, 'pan y');
}

// growing past the photo is clamped to the photo
{
  const r = cropFromBox(4000, 3000, base, 4 / 3, { x0: -0.5, y0: -0.5, x1: 1.5, y1: 1.5 }, false);
  near(r.zoom, 1, 'clamped zoom');
}

// round trip on a rotated, already-zoomed and panned crop
{
  const e = { ...base, rotate: 90, zoom: 1.6, cropX: 0.4, cropY: -0.3 };
  const before = cropView(4000, 3000, e, 3 / 4);
  const r = cropFromBox(4000, 3000, e, 3 / 4, { x0: 0, y0: 0, x1: 1, y1: 1 }, true);
  const after = cropView(4000, 3000, { ...e, zoom: r.zoom, cropX: r.cropX, cropY: r.cropY }, r.ratio);
  near(after.cx, before.cx, 'round-trip cx');
  near(after.cy, before.cy, 'round-trip cy');
  near(after.vw, before.vw, 'round-trip width');
}

console.log('crop maths ok');
