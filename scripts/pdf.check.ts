// Self-check for the hand-written PDF writer: xref offsets must point at each "N 0 obj".
import assert from 'node:assert/strict';
import { buildPdf } from '../src/lib/pdf.ts';

const fakeJpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const blob = buildPdf([
  { jpeg: fakeJpeg, pxWidth: 2, pxHeight: 2, ptWidth: 450, ptHeight: 600 },
  { jpeg: fakeJpeg, pxWidth: 2, pxHeight: 2, ptWidth: 450, ptHeight: 600 },
]);
const bytes = new Uint8Array(await blob.arrayBuffer());
const text = Buffer.from(bytes).toString('latin1');
const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
assert.ok(text.slice(startxref).startsWith('xref'), 'startxref points at xref table');
const entries = [...text.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
assert.equal(entries.length, 8, '2 shared objects + 3 per page');
entries.forEach((offset, i) => assert.ok(text.slice(offset).startsWith(`${i + 1} 0 obj`), `object ${i + 1} offset`));
assert.match(text, /\/Count 2/);
console.log('pdf ok');
