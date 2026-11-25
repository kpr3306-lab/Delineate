// Self-check for print packing: everything placed, nothing overlapping, nothing outside the printable area.
import assert from 'node:assert/strict';
import { PAPERS, PRINT_SIZES, packPrints, type Placed } from '../src/lib/print.ts';

const a4 = PAPERS.find((p) => p.id === 'a4')!;
const size = (id: string) => PRINT_SIZES.find((s) => s.id === id)!;
const overlap = (a: Placed, b: Placed) => a.x < b.x + b.w - 1e-6 && b.x < a.x + a.w - 1e-6 && a.y < b.y + b.h - 1e-6 && b.y < a.y + a.h - 1e-6;
const check = (pages: Placed[][], margin: number, paper: { w: number; h: number }) => {
  for (const page of pages) {
    for (const p of page) {
      assert.ok(p.x >= margin - 1e-6 && p.y >= margin - 1e-6, 'inside the top-left margin');
      assert.ok(p.x + p.w <= paper.w - margin + 1e-6 && p.y + p.h <= paper.h - margin + 1e-6, 'inside the bottom-right margin');
    }
    for (let i = 0; i < page.length; i += 1) for (let j = i + 1; j < page.length; j += 1) assert.ok(!overlap(page[i], page[j]), 'no overlap');
  }
};

// eight wallet prints fit one A4 page (3 × 3 grid of 2.5 × 3.5 in)
{
  const s = size('wallet');
  const r = packPrints([{ id: 'w', w: s.w, h: s.h, copies: 8 }], a4, 0.2, 0.1);
  assert.equal(r.pages.length, 1);
  assert.equal(r.pages[0].length, 8);
  check(r.pages, 0.2, a4);
}

// mixed sizes and copies spill onto a second page, every copy placed once
{
  const items = [
    { id: 'a', w: size('5x7').w, h: size('5x7').h, copies: 2 },
    { id: 'b', w: size('4x6').w, h: size('4x6').h, copies: 3 },
    { id: 'c', w: size('passport').w, h: size('passport').h, copies: 6 },
  ];
  const r = packPrints(items, a4, 0.25, 0.12);
  assert.equal(r.pages.flat().length, 11);
  assert.ok(r.pages.length >= 2);
  check(r.pages, 0.25, a4);
}

// too big for 4 × 6 photo paper: reported, not shrunk; a landscape 6 × 4 turns to fit
{
  const paper = PAPERS.find((p) => p.id === 'p4x6')!;
  const r = packPrints(
    [
      { id: 'big', w: 8, h: 10, copies: 1 },
      { id: 'wide', w: 6, h: 4, copies: 1 },
    ],
    paper,
    0,
    0,
  );
  assert.deepEqual(r.tooBig, ['big']);
  assert.equal(r.pages.length, 1);
  assert.equal(r.pages[0][0].rotated, true);
  check(r.pages, 0, paper);
}

console.log('print packing ok');

// calendar grids: weekday of the 1st, month length, leap years, Monday or Sunday starts
{
  const { monthGrid } = await import('../src/lib/print.ts');
  const nov = monthGrid(2026, 10, false); // 1 Nov 2026 is a Sunday
  assert.equal(nov[0][0], 1);
  assert.equal(nov.flat().filter(Boolean).length, 30);
  const novMon = monthGrid(2026, 10, true);
  assert.equal(novMon[0].indexOf(1), 6);
  assert.equal(monthGrid(2028, 1, true).flat().filter(Boolean).length, 29); // leap year
  assert.equal(monthGrid(2026, 1, true).flat().filter(Boolean).length, 28);
  for (const g of [nov, novMon]) for (const w of g) assert.equal(w.length, 7);
  console.log('calendar grid ok');
}
