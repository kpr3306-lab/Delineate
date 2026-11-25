// Self-check for the duplicate finder: same picture (even brightened) groups; different pictures don't.
import assert from 'node:assert/strict';
import { dHash, groupSimilar, hamming } from '../src/lib/dupes.ts';

const img = (f: (x: number, y: number) => number) => Array.from({ length: 72 }, (_, i) => f(i % 9, Math.floor(i / 9)));
const sunset = img((x, y) => 40 + y * 20 + (x - 4) ** 2 * 3);
const brighter = sunset.map((v) => Math.min(255, v * 1.15 + 10)); // the same photo, re-edited
const stripes = img((x) => (x % 2 ? 220 : 30));
const ramp = img((x, y) => 255 - x * 25 - y);

assert.equal(hamming(dHash(sunset), dHash(sunset)), 0);
assert.ok(hamming(dHash(sunset), dHash(brighter)) <= 2, 'an edit of the same photo stays close');
assert.ok(hamming(dHash(sunset), dHash(stripes)) > 10, 'different pictures are far apart');

const groups = groupSimilar([
  { id: 'a', hash: dHash(sunset) },
  { id: 'b', hash: dHash(stripes) },
  { id: 'c', hash: dHash(brighter) },
  { id: 'd', hash: dHash(ramp) },
]);
assert.deepEqual(groups.map((g) => g.sort()), [['a', 'c']]);
assert.deepEqual(groupSimilar([{ id: 'x', hash: 1n }]), []);
console.log('dupes ok');
