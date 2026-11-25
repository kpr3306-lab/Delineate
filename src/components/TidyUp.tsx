import { Check, Copy, HardDrive, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { PhotoRecord } from '../types';
import { dHash, groupSimilar } from '../lib/dupes';
import { formatBytes } from '../lib/backup';
import { Modal, Spinner, Thumb } from './ui';

// fingerprints survive while the app is open, so a second look is instant
const HASHES = new Map<string, bigint>();
const key = (p: PhotoRecord) => `${p.id}:${p.blob.size}`;

async function fingerprint(p: PhotoRecord) {
  const k = key(p);
  const known = HASHES.get(k);
  if (known !== undefined) return known;
  const c = document.createElement('canvas');
  c.width = 9;
  c.height = 8;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  let bmp: ImageBitmap | null = null;
  try {
    bmp = await createImageBitmap(p.blob, { resizeWidth: 9, resizeHeight: 8, resizeQuality: 'medium' });
  } catch {
    bmp = await createImageBitmap(p.blob); // older Safari: no resize option
  }
  ctx.drawImage(bmp, 0, 0, 9, 8);
  bmp.close();
  const d = ctx.getImageData(0, 0, 9, 8).data;
  const grey = Array.from({ length: 72 }, (_, i) => d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114);
  const h = dHash(grey);
  HASHES.set(k, h);
  return h;
}
const bytes = (p: PhotoRecord) => p.blob.size + (p.original?.size ?? 0) + (p.camRaw?.size ?? 0) + (p.fullRes?.size ?? 0);
/** Which copy to keep by default: a favourite, then the most pixels, then the oldest. */
const best = (list: PhotoRecord[]) => [...list].sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)) || b.width * b.height - a.width * a.height || a.createdAt - b.createdAt)[0];

/** Archive › Tidy up: near-duplicate photos and the largest files, ready to clear out (with Undo). */
export default function TidyUp({ photos, onClose, onDelete }: { photos: PhotoRecord[]; onClose: () => void; onDelete: (records: PhotoRecord[]) => void }) {
  const [view, setView] = useState<'similar' | 'large'>('similar');
  const [groups, setGroups] = useState<PhotoRecord[][] | null>(null);
  const [done, setDone] = useState(0);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  const stills = useMemo(() => photos.filter((p) => p.kind !== 'animated'), [photos]);

  useEffect(() => {
    let live = true;
    (async () => {
      const items: { id: string; hash: bigint }[] = [];
      for (let i = 0; i < stills.length; i += 1) {
        try {
          items.push({ id: stills[i].id, hash: await fingerprint(stills[i]) });
        } catch {
          /* an unreadable file simply isn't compared */
        }
        if (!live) return;
        if (i % 8 === 7) setDone(i + 1);
      }
      const byId = new Map(stills.map((p) => [p.id, p]));
      const found = groupSimilar(items).map((g) => g.map((id) => byId.get(id)!));
      if (!live) return;
      setGroups(found);
      // tick every copy except the one worth keeping
      setTicked(new Set(found.flatMap((g) => g.filter((p) => p !== best(g)).map((p) => p.id))));
    })();
    return () => {
      live = false;
    };
  }, [stills]);

  const large = useMemo(() => [...photos].sort((a, b) => bytes(b) - bytes(a)).slice(0, 24), [photos]);
  const toggle = (id: string) =>
    setTicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const chosen = photos.filter((p) => ticked.has(p.id));
  const freed = chosen.reduce((n, p) => n + bytes(p), 0);

  const tile = (p: PhotoRecord, note: string) => (
    <button key={p.id} type="button" className={`td-tile ${ticked.has(p.id) ? 'is-ticked' : ''}`} onClick={() => toggle(p.id)} aria-pressed={ticked.has(p.id)}>
      <Thumb photo={p} className="td-img" />
      <span className="td-check" aria-hidden="true">{ticked.has(p.id) && <Check size={12} strokeWidth={3} />}</span>
      <small>{note}</small>
    </button>
  );

  return (
    <Modal title="Tidy up" eyebrow="Archive" wide onClose={onClose}>
      <div className="segmented td-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={view === 'similar'} className={view === 'similar' ? 'is-active' : ''} onClick={() => setView('similar')}>
          <Copy size={13} /> Similar {groups ? `(${groups.length})` : ''}
        </button>
        <button type="button" role="tab" aria-selected={view === 'large'} className={view === 'large' ? 'is-active' : ''} onClick={() => setView('large')}>
          <HardDrive size={13} /> Largest
        </button>
      </div>
      <div className="td-body">
        {view === 'similar' ? (
          groups === null ? (
            <p className="modal-copy td-wait">
              <Spinner /> Comparing photos… {done}/{stills.length}
            </p>
          ) : groups.length === 0 ? (
            <p className="modal-copy">No near-duplicates found. Nice and tidy.</p>
          ) : (
            <>
              <p className="modal-copy">Photos that look almost the same. The best copy of each set is left unticked — favourites first, then the sharpest.</p>
              {groups.map((g) => (
                <div key={g[0].id} className="td-group">
                  {g.map((p) => tile(p, `${p.width}×${p.height}${p.favorite ? ' · ♥' : ''}`))}
                </div>
              ))}
            </>
          )
        ) : (
          <>
            <p className="modal-copy">The frames taking the most space, including their originals and clean camera copies.</p>
            <div className="td-group td-large">{large.map((p) => tile(p, formatBytes(bytes(p))))}</div>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="button button-outline" onClick={onClose}>
          Close
        </button>
        <button type="button" className="button button-danger" disabled={!chosen.length} onClick={() => onDelete(chosen)}>
          <Trash2 size={15} /> Delete {chosen.length || ''} {chosen.length ? `· frees ${formatBytes(freed)}` : ''}
        </button>
      </div>
    </Modal>
  );
}
