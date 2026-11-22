// Self-check for the EXIF reader: a hand-built JPEG with a date and a GPS fix must read back exactly.
import assert from 'node:assert/strict';
import { parseExif } from '../src/lib/exif.ts';

function jpegWithExif(le: boolean) {
  const t = new Uint8Array(400);
  const v = new DataView(t.buffer);
  const u16 = (o: number, x: number) => v.setUint16(o, x, le);
  const u32 = (o: number, x: number) => v.setUint32(o, x, le);
  const entry = (o: number, tag: number, type: number, count: number, value: number) => {
    u16(o, tag);
    u16(o + 2, type);
    u32(o + 4, count);
    u32(o + 8, value);
  };
  t.set(le ? [0x49, 0x49] : [0x4d, 0x4d], 0);
  u16(2, 42);
  u32(4, 8);
  // IFD0 @8: Exif pointer, GPS pointer
  u16(8, 2);
  entry(10, 0x8769, 4, 1, 40);
  entry(22, 0x8825, 4, 1, 80);
  // Exif IFD @40: DateTimeOriginal -> @200
  u16(40, 1);
  entry(42, 0x9003, 2, 20, 200);
  [...'2024:12:31 18:45:09\0'].forEach((c, i) => (t[200 + i] = c.charCodeAt(0)));
  // GPS IFD @80: N 15°29'24", W 73°49'48"
  u16(80, 4);
  entry(82, 1, 2, 2, 0);
  t[90] = 'N'.charCodeAt(0);
  entry(94, 2, 5, 3, 240);
  entry(106, 3, 2, 2, 0);
  t[114] = 'W'.charCodeAt(0);
  entry(118, 4, 5, 3, 288);
  [[15, 1], [29, 1], [24, 1]].forEach(([n, d], i) => (u32(240 + i * 8, n), u32(244 + i * 8, d)));
  [[73, 1], [49, 1], [4800, 100]].forEach(([n, d], i) => (u32(288 + i * 8, n), u32(292 + i * 8, d)));
  const app1Len = 2 + 6 + t.length;
  const out = new Uint8Array(4 + app1Len + 2);
  const ov = new DataView(out.buffer);
  ov.setUint16(0, 0xffd8);
  ov.setUint16(2, 0xffe1);
  ov.setUint16(4, app1Len);
  out.set([0x45, 0x78, 0x69, 0x66, 0, 0], 6);
  out.set(t, 12);
  ov.setUint16(12 + t.length, 0xffd9);
  return out.buffer;
}

for (const le of [true, false]) {
  const info = parseExif(jpegWithExif(le));
  assert.equal(info.taken, new Date(2024, 11, 31, 18, 45, 9).getTime(), `date (${le ? 'II' : 'MM'})`);
  assert.deepEqual(info.place, { lat: 15.49, lon: -73.83 }, `gps (${le ? 'II' : 'MM'})`);
}
assert.deepEqual(parseExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer), {}, 'not a JPEG');
assert.deepEqual(parseExif(jpegWithExif(true).slice(0, 60)), {}, 'truncated EXIF is ignored');

console.log('exif ok');
