import { ArrowUpToLine, CalendarDays, ImagePlus, Plus, RotateCcw, RotateCw, Save, StickyNote, Ticket, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { Collection, PhotoRecord, Wall, WallItem } from '../../types';
import { canvasToBlob, clamp, loadImage, uid } from '../../lib/utils';
import { Modal, PhotoPicker, useObjectUrl } from '../ui';

const SURFACES: { id: Wall['surface']; label: string }[] = [
  { id: 'cork', label: 'Cork' },
  { id: 'linen', label: 'Linen' },
  { id: 'slate', label: 'Slate' },
  { id: 'paper', label: 'Paper' },
];
const NOTE_COLORS = ['#ffe680', '#ffc9d6', '#c8ecd4', '#cfe3ff'];
const RATIO = 3 / 4; // board height / width
const today = () => new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase();

/** Size of an item as fractions of the board: [width, height]. */
function boxOf(it: WallItem, photo?: PhotoRecord): [number, number] {
  if (it.kind === 'photo') {
    const a = photo ? photo.height / photo.width : 1;
    return [it.w, (it.w * 0.9 * a + it.w * 0.22) / RATIO];
  }
  if (it.kind === 'note') return [it.w, it.w / RATIO];
  if (it.kind === 'ticket') return [it.w, (it.w * 0.45) / RATIO];
  return [it.w, (it.w * 0.24) / RATIO];
}

function WallPhoto({ photo }: { photo?: PhotoRecord }) {
  const url = useObjectUrl(photo?.blob);
  return <span className="mw-photo">{url ? <img src={url} alt={photo?.name ?? ''} draggable={false} /> : <i>Photo removed</i>}</span>;
}

/** Memory Wall: a free board of photos, notes, dates and ticket stubs around one trip, person or theme. */
export default function MemoryWall({
  photos,
  walls,
  onSave,
  onDelete,
  onSavePhoto,
  notify,
}: {
  photos: PhotoRecord[];
  walls: Wall[];
  onSave: (c: Collection) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onSavePhoto: (r: PhotoRecord) => Promise<void>;
  notify: (m: string, tone?: 'default' | 'warning') => void;
}) {
  const [wallId, setWallId] = useState<string | null>(walls[0]?.id ?? null);
  const stored = walls.find((w) => w.id === wallId) ?? null;
  const [wall, setWall] = useState<Wall | null>(stored);
  const [sel, setSel] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: string; mode: 'move' | 'size'; x: number; y: number; ox: number; oy: number; ow: number } | null>(null);
  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);

  // a different wall was chosen (or created): load it into the editor
  useEffect(() => {
    setWall(walls.find((w) => w.id === wallId) ?? null);
    setSel(null);
    // only when switching walls, not on every save round-trip
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wallId]);
  // autosave shortly after the last change
  useEffect(() => {
    if (!wall) return;
    const t = window.setTimeout(() => void onSave(wall), 450);
    return () => window.clearTimeout(t);
  }, [wall, onSave]);

  const newWall = () => {
    const w: Wall = { id: uid(), type: 'wall', name: `Wall ${walls.length + 1}`, surface: 'cork', items: [], createdAt: Date.now(), updatedAt: Date.now() };
    void onSave(w).then(() => setWallId(w.id));
    setWall(w);
  };
  const edit = (fn: (w: Wall) => Wall) => setWall((w) => (w ? { ...fn(w), updatedAt: Date.now() } : w));
  const patch = (id: string, p: Partial<WallItem>) => edit((w) => ({ ...w, items: w.items.map((it) => (it.id === id ? { ...it, ...p } : it)) }));
  const topZ = () => (wall?.items.reduce((m, it) => Math.max(m, it.z), 0) ?? 0) + 1;
  const add = (kind: WallItem['kind'], extra: Partial<WallItem> = {}) => {
    const n = wall?.items.length ?? 0;
    const item: WallItem = {
      id: uid(),
      kind,
      // new pieces fill a loose 4 × 3 grid across the board instead of piling up
      x: 0.05 + (n % 4) * 0.235 + (Math.floor(n / 12) % 2) * 0.05,
      y: 0.06 + (Math.floor(n / 4) % 3) * 0.3 + (Math.floor(n / 12) % 2) * 0.04,
      w: kind === 'photo' ? 0.24 : kind === 'note' ? 0.17 : kind === 'ticket' ? 0.26 : 0.2,
      r: ((n * 7) % 13) - 6,
      z: topZ(),
      text: kind === 'note' ? 'Write something…' : kind === 'date' ? today() : kind === 'ticket' ? 'ADMIT ONE' : undefined,
      color: kind === 'note' ? NOTE_COLORS[n % NOTE_COLORS.length] : undefined,
      ...extra,
    };
    edit((w) => ({ ...w, items: [...w.items, item] }));
    setSel(item.id);
  };

  const down = (e: RPointerEvent, it: WallItem, mode: 'move' | 'size') => {
    e.stopPropagation();
    setSel(it.id);
    board.current?.setPointerCapture(e.pointerId);
    drag.current = { id: it.id, mode, x: e.clientX, y: e.clientY, ox: it.x, oy: it.y, ow: it.w };
    if (mode === 'move' && it.z < topZ() - 1) patch(it.id, { z: topZ() });
  };
  const move = (e: RPointerEvent) => {
    const d = drag.current;
    const box = board.current?.getBoundingClientRect();
    if (!d || !box) return;
    const dx = (e.clientX - d.x) / box.width;
    const dy = (e.clientY - d.y) / box.height;
    if (d.mode === 'move') patch(d.id, { x: clamp(d.ox + dx, -0.05, 0.95), y: clamp(d.oy + dy, -0.05, 0.95) });
    else patch(d.id, { w: clamp(d.ow + dx, 0.08, 0.7) });
  };
  const up = () => (drag.current = null);

  const selected = wall?.items.find((it) => it.id === sel) ?? null;

  const exportWall = async () => {
    if (!wall) return;
    setExporting(true);
    try {
      const W = 2400;
      const H = W * RATIO;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d')!;
      const base = { cork: '#b8875a', linen: '#e9e1d2', slate: '#3b3f44', paper: '#f7f3ea' }[wall.surface];
      g.fillStyle = base;
      g.fillRect(0, 0, W, H);
      for (let i = 0; i < 9000; i += 1) {
        g.fillStyle = wall.surface === 'slate' ? `rgba(255,255,255,${Math.random() * 0.05})` : `rgba(60,40,20,${Math.random() * 0.08})`;
        g.fillRect(Math.random() * W, Math.random() * H, 3, 3);
      }
      for (const it of [...wall.items].sort((a, b) => a.z - b.z)) {
        const photo = it.photoId ? byId.get(it.photoId) : undefined;
        const [bw, bh] = boxOf(it, photo);
        const w = bw * W;
        const h = bh * H;
        g.save();
        g.translate(it.x * W + w / 2, it.y * H + h / 2);
        g.rotate((it.r * Math.PI) / 180);
        g.shadowColor = 'rgba(0,0,0,0.35)';
        g.shadowBlur = 26;
        g.shadowOffsetY = 10;
        if (it.kind === 'photo') {
          g.fillStyle = '#fffdf8';
          g.fillRect(-w / 2, -h / 2, w, h);
          g.shadowColor = 'transparent';
          if (photo) {
            const img = await loadImage(photo.blob);
            const iw = w * 0.9;
            const ih = iw * (photo.height / photo.width);
            g.drawImage(img, -iw / 2, -h / 2 + w * 0.05, iw, ih);
          }
        } else if (it.kind === 'note') {
          g.fillStyle = it.color ?? NOTE_COLORS[0];
          g.fillRect(-w / 2, -h / 2, w, h);
          g.shadowColor = 'transparent';
          g.fillStyle = '#3a3226';
          g.font = `italic ${w * 0.13}px "Instrument Serif", Georgia, serif`;
          g.textBaseline = 'top';
          const words = (it.text ?? '').split(/\s+/);
          let line = '';
          let y = -h / 2 + w * 0.1;
          for (const word of words) {
            const t = line ? `${line} ${word}` : word;
            if (g.measureText(t).width > w * 0.84 && line) {
              g.fillText(line, -w / 2 + w * 0.08, y);
              line = word;
              y += w * 0.15;
            } else line = t;
          }
          g.fillText(line, -w / 2 + w * 0.08, y);
        } else if (it.kind === 'ticket') {
          g.fillStyle = '#f2e3c4';
          g.fillRect(-w / 2, -h / 2, w, h);
          g.shadowColor = 'transparent';
          g.strokeStyle = '#a0512f';
          g.setLineDash([w * 0.02, w * 0.02]);
          g.lineWidth = w * 0.008;
          g.beginPath();
          g.moveTo(w * 0.22, -h / 2 + 6);
          g.lineTo(w * 0.22, h / 2 - 6);
          g.stroke();
          g.fillStyle = '#a0512f';
          g.font = `700 ${w * 0.08}px "DM Mono", monospace`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText((it.text ?? '').toUpperCase().slice(0, 22), -w * 0.06, 0);
        } else {
          g.fillStyle = '#26231f';
          g.fillRect(-w / 2, -h / 2, w, h);
          g.shadowColor = 'transparent';
          g.fillStyle = '#f4efe4';
          g.font = `600 ${h * 0.45}px "DM Mono", monospace`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillText((it.text ?? '').toUpperCase().slice(0, 24), 0, 0);
        }
        g.restore();
      }
      const blob = await canvasToBlob(c, 'image/jpeg', 0.9);
      await onSavePhoto({
        id: uid(),
        name: wall.name.slice(0, 40),
        createdAt: Date.now(),
        blob,
        mime: 'image/jpeg',
        width: W,
        height: H,
        filterName: 'Memory Wall',
        kind: 'collage',
        developed: true,
        note: `Memory Wall · ${wall.items.length} pieces`,
      });
      notify('Wall saved to your archive as an image.');
    } catch (error) {
      console.error(error);
      notify('The wall could not be saved.', 'warning');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mw">
      <div className="mw-bar">
        <div className="mw-walls" role="tablist" aria-label="Walls">
          {walls.map((w) => (
            <button key={w.id} type="button" role="tab" aria-selected={w.id === wallId} className={w.id === wallId ? 'is-active' : ''} onClick={() => setWallId(w.id)}>
              {w.id === wallId && wall ? wall.name : w.name}
            </button>
          ))}
          <button type="button" className="mw-new" onClick={newWall}>
            <Plus size={14} /> New wall
          </button>
        </div>
      </div>

      {!wall ? (
        <div className="mw-empty">
          <p>Pin photos, notes, dates and ticket stubs around a trip, a person or a season.</p>
          <button type="button" className="button button-dark" onClick={newWall}>
            <Plus size={15} /> Start a wall
          </button>
        </div>
      ) : (
        <div className="mw-work">
          <div className="mw-tools">
            <input className="text-input mw-name" value={wall.name} maxLength={48} aria-label="Wall name" onChange={(e) => edit((w) => ({ ...w, name: e.target.value }))} />
            <div className="mw-tool-row">
              <button type="button" className="button button-outline" onClick={() => setPicking(true)}>
                <ImagePlus size={14} /> Photo
              </button>
              <button type="button" className="button button-outline" onClick={() => add('note')}>
                <StickyNote size={14} /> Note
              </button>
              <button type="button" className="button button-outline" onClick={() => add('date')}>
                <CalendarDays size={14} /> Date
              </button>
              <button type="button" className="button button-outline" onClick={() => add('ticket')}>
                <Ticket size={14} /> Ticket
              </button>
            </div>
            <div className="segmented mw-surfaces" role="radiogroup" aria-label="Surface">
              {SURFACES.map((s) => (
                <button key={s.id} type="button" role="radio" aria-checked={wall.surface === s.id} className={wall.surface === s.id ? 'is-active' : ''} onClick={() => edit((w) => ({ ...w, surface: s.id }))}>
                  {s.label}
                </button>
              ))}
            </div>
            {selected ? (
              <div className="mw-sel">
                <span className="mw-sel-title">Selected {selected.kind}</span>
                {selected.kind !== 'photo' && (
                  <textarea
                    className="text-input"
                    rows={selected.kind === 'note' ? 3 : 1}
                    maxLength={selected.kind === 'note' ? 140 : 24}
                    value={selected.text ?? ''}
                    aria-label="Text"
                    onChange={(e) => patch(selected.id, { text: e.target.value })}
                  />
                )}
                {selected.kind === 'note' && (
                  <div className="mw-colors">
                    {NOTE_COLORS.map((col) => (
                      <button key={col} type="button" style={{ background: col }} className={selected.color === col ? 'is-on' : ''} onClick={() => patch(selected.id, { color: col })} aria-label={`Note colour ${col}`} />
                    ))}
                  </div>
                )}
                <div className="mw-tool-row">
                  <button type="button" className="round-icon" onClick={() => patch(selected.id, { r: selected.r - 5 })} aria-label="Rotate left">
                    <RotateCcw size={14} />
                  </button>
                  <button type="button" className="round-icon" onClick={() => patch(selected.id, { r: selected.r + 5 })} aria-label="Rotate right">
                    <RotateCw size={14} />
                  </button>
                  <button type="button" className="round-icon" onClick={() => patch(selected.id, { z: topZ() })} aria-label="Bring to front">
                    <ArrowUpToLine size={14} />
                  </button>
                  <button
                    type="button"
                    className="round-icon"
                    onClick={() => {
                      edit((w) => ({ ...w, items: w.items.filter((it) => it.id !== selected.id) }));
                      setSel(null);
                    }}
                    aria-label="Remove from wall"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <p className="mw-hint">Drag pieces to arrange them. Pull a corner to resize. Tap one to edit its text, rotate it or remove it.</p>
            )}
            <div className="mw-tool-row mw-end">
              <button type="button" className="button button-dark" onClick={() => void exportWall()} disabled={exporting || !wall.items.length}>
                <Save size={14} /> {exporting ? 'Saving…' : 'Save as image'}
              </button>
              <button type="button" className="button button-outline" onClick={() => setRemoving(true)}>
                <Trash2 size={14} /> Delete wall
              </button>
            </div>
          </div>

          <div className="mw-board-wrap">
            <div
              ref={board}
              className={`mw-board is-${wall.surface}`}
              onPointerMove={move}
              onPointerUp={up}
              onPointerCancel={up}
              onPointerDown={() => setSel(null)}
            >
              {[...wall.items]
                .sort((a, b) => a.z - b.z)
                .map((it) => {
                  const photo = it.photoId ? byId.get(it.photoId) : undefined;
                  const [bw, bh] = boxOf(it, photo);
                  return (
                    <div
                      key={it.id}
                      className={`mw-item is-${it.kind} ${sel === it.id ? 'is-selected' : ''}`}
                      style={{ left: `${it.x * 100}%`, top: `${it.y * 100}%`, width: `${bw * 100}%`, height: `${bh * 100}%`, transform: `rotate(${it.r}deg)`, zIndex: it.z, background: it.kind === 'note' ? it.color : undefined }}
                      onPointerDown={(e) => down(e, it, 'move')}
                    >
                      {it.kind === 'photo' ? <WallPhoto photo={photo} /> : <span className="mw-text">{it.text}</span>}
                      {it.kind === 'photo' && <i className="mw-tape" aria-hidden="true" />}
                      {it.kind === 'note' && <i className="mw-pin" aria-hidden="true" />}
                      {sel === it.id && <span className="mw-handle" onPointerDown={(e) => down(e, it, 'size')} aria-hidden="true" />}
                    </div>
                  );
                })}
              {!wall.items.length && <p className="mw-board-hint">Add a photo, a note, a date or a ticket stub to start pinning.</p>}
            </div>
          </div>
        </div>
      )}

      {picking && (
        <PhotoPicker
          photos={photos}
          title="Pin photos to the wall"
          selected={wall?.items.filter((it) => it.kind === 'photo').map((it) => it.photoId!) ?? []}
          onPick={(id) => add('photo', { photoId: id })}
          onClose={() => setPicking(false)}
        />
      )}
      {removing && wall && (
        <Modal title="Delete this wall?" eyebrow="Memories / Memory wall" onClose={() => setRemoving(false)}>
          <p className="modal-copy">
            <strong>{wall.name}</strong> will be deleted. Photos stay in your archive.
          </p>
          <div className="modal-actions">
            <button type="button" className="button button-dark" onClick={() => setRemoving(false)}>Keep it</button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                const id = wall.id;
                setRemoving(false);
                setWall(null);
                setWallId(walls.find((w) => w.id !== id)?.id ?? null);
                void onDelete(id);
              }}
            >
              <Trash2 size={14} /> Delete wall
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
