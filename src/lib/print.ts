// Print sizes and page packing for Studio › Frames. No DOM and no imports, so `node scripts/print.check.ts` can test it.

export type Unit = 'in' | 'cm';
/** A print size, always stored in inches (short side × long side). */
export type PrintSize = { id: string; label: string; w: number; h: number };

const CM = 1 / 2.54;
export const PRINT_SIZES: PrintSize[] = [
  { id: 'wallet', label: 'Wallet', w: 2.5, h: 3.5 },
  { id: '3x5', label: '3.5 × 5', w: 3.5, h: 5 },
  { id: '4x6', label: '4 × 6', w: 4, h: 6 },
  { id: '5x7', label: '5 × 7', w: 5, h: 7 },
  { id: '6x8', label: '6 × 8', w: 6, h: 8 },
  { id: '8x10', label: '8 × 10', w: 8, h: 10 },
  { id: 'sq4', label: 'Square 4"', w: 4, h: 4 },
  { id: 'passport', label: 'Passport', w: 3.5 * CM, h: 4.5 * CM },
  { id: 'a6', label: 'A6', w: 10.5 * CM, h: 14.8 * CM },
  { id: 'a5', label: 'A5', w: 14.8 * CM, h: 21 * CM },
];

export type Paper = { id: string; label: string; w: number; h: number };
export const PAPERS: Paper[] = [
  { id: 'a4', label: 'A4', w: 21 * CM, h: 29.7 * CM },
  { id: 'letter', label: 'US Letter', w: 8.5, h: 11 },
  { id: 'a3', label: 'A3', w: 29.7 * CM, h: 42 * CM },
  { id: 'p4x6', label: '4 × 6 photo paper', w: 4, h: 6 },
  { id: 'p5x7', label: '5 × 7 photo paper', w: 5, h: 7 },
];

export const toUnit = (inches: number, unit: Unit) => (unit === 'cm' ? inches * 2.54 : inches);
export const fromUnit = (value: number, unit: Unit) => (unit === 'cm' ? value / 2.54 : value);
export const fmt = (inches: number, unit: Unit) => {
  const v = toUnit(inches, unit);
  return `${Number.isInteger(+v.toFixed(2)) ? v.toFixed(0) : v.toFixed(unit === 'cm' ? 1 : 2).replace(/0$/, '')}`;
};

export type PrintItem = { id: string; w: number; h: number; copies: number };
export type Placed = { id: string; x: number; y: number; w: number; h: number; rotated: boolean };

/**
 * Shelf packing: every copy of every print onto as few pages as possible, in rows, biggest first.
 * A print may turn 90° when that is the only way it fits on the paper. Sizes in inches.
 * Returns the pages and the ids of prints too big for this paper (left out, never shrunk).
 */
export function packPrints(items: PrintItem[], paper: { w: number; h: number }, margin: number, gap: number) {
  const W = paper.w - margin * 2;
  const H = paper.h - margin * 2;
  const tooBig = new Set<string>();
  const copies: { id: string; w: number; h: number; rotated: boolean }[] = [];
  for (const it of items) {
    let w = it.w;
    let h = it.h;
    let rotated = false;
    if (w > W + 1e-6 || h > H + 1e-6) {
      if (h <= W + 1e-6 && w <= H + 1e-6) [w, h, rotated] = [h, w, true];
      else {
        tooBig.add(it.id);
        continue;
      }
    }
    for (let c = 0; c < Math.max(0, Math.floor(it.copies)); c += 1) copies.push({ id: it.id, w, h, rotated });
  }
  copies.sort((a, b) => b.h - a.h || b.w - a.w);

  const pages: Placed[][] = [];
  let page: Placed[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  for (const c of copies) {
    if (x > 0 && x + c.w > W + 1e-6) {
      // next row
      y += rowH + gap;
      x = 0;
      rowH = 0;
    }
    if (y + c.h > H + 1e-6) {
      pages.push(page);
      page = [];
      x = 0;
      y = 0;
      rowH = 0;
    }
    page.push({ id: c.id, x: margin + x, y: margin + y, w: c.w, h: c.h, rotated: c.rotated });
    x += c.w + gap;
    rowH = Math.max(rowH, c.h);
  }
  if (page.length) pages.push(page);
  return { pages, tooBig: [...tooBig] };
}

/** Days of a month as a grid of weeks (null = blank cell). Pure, so it is easy to trust. */
export function monthGrid(year: number, month: number, weekStartsMonday: boolean) {
  const first = new Date(year, month, 1).getDay(); // 0 = Sunday
  const lead = weekStartsMonday ? (first + 6) % 7 : first;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  while (cells.length % 7) cells.push(null);
  const weeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
