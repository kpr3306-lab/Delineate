// Finding near-duplicate photos: a 64-bit difference hash per photo, grouped by how few bits differ.
// No DOM and no imports, so `node scripts/dupes.check.ts` can test it.

/** dHash: 9×8 grey pixels → 64 bits, one per "is this pixel brighter than its right neighbour". */
export function dHash(grey: ArrayLike<number>): bigint {
  let h = 0n;
  for (let y = 0; y < 8; y += 1)
    for (let x = 0; x < 8; x += 1) {
      h <<= 1n;
      if (grey[y * 9 + x] > grey[y * 9 + x + 1]) h |= 1n;
    }
  return h;
}

export function hamming(a: bigint, b: bigint) {
  let v = a ^ b;
  let n = 0;
  while (v) {
    n += Number(v & 1n);
    v >>= 1n;
  }
  return n;
}

/** Groups of ids whose hashes are within `limit` bits of one another (single linkage). Only groups of 2+. */
export function groupSimilar(items: { id: string; hash: bigint }[], limit = 6) {
  const parent = new Map(items.map((i) => [i.id, i.id]));
  const find = (id: string): string => {
    const p = parent.get(id)!;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  for (let i = 0; i < items.length; i += 1)
    for (let j = i + 1; j < items.length; j += 1)
      if (hamming(items[i].hash, items[j].hash) <= limit) parent.set(find(items[i].id), find(items[j].id));
  const groups = new Map<string, string[]>();
  for (const it of items) {
    const root = find(it.id);
    groups.set(root, [...(groups.get(root) ?? []), it.id]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}
