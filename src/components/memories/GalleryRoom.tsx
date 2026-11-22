import { ChevronLeft, ChevronRight, Expand, Pause, Play, Shrink } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Album, PhotoRecord } from '../../types';
import { cameraOf } from '../../lib/memories';
import { useObjectUrl } from '../ui';

type Room = { id: string; name: string; note: string; photos: PhotoRecord[] };

/** The Archive Room: one framed print at a time on a lit gallery wall, with a quiet slideshow. */
export default function GalleryRoom({ photos, albums }: { photos: PhotoRecord[]; albums: Album[] }) {
  const rooms = useMemo<Room[]>(() => {
    const shown = photos.filter((p) => p.developed !== false);
    const list: Room[] = [];
    const fav = shown.filter((p) => p.favorite);
    if (fav.length) list.push({ id: 'fav', name: 'Favourites', note: 'The ones you kept closest', photos: fav });
    for (const a of albums) {
      const ps = shown.filter((p) => a.photoIds.includes(p.id));
      if (ps.length) list.push({ id: a.id, name: a.name, note: 'Album', photos: ps });
    }
    const years = [...new Set(shown.map((p) => new Date(p.createdAt).getFullYear()))].sort((a, b) => b - a);
    for (const y of years) list.push({ id: `y${y}`, name: String(y), note: 'The year', photos: shown.filter((p) => new Date(p.createdAt).getFullYear() === y) });
    return list;
  }, [photos, albums]);
  const [roomId, setRoomId] = useState(rooms[0]?.id ?? '');
  const room = rooms.find((r) => r.id === roomId) ?? rooms[0];
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [full, setFull] = useState(false);
  const hall = useRef<HTMLDivElement>(null);
  const swipe = useRef<number | null>(null);
  const n = room?.photos.length ?? 0;
  const idx = n ? ((i % n) + n) % n : 0;
  const current = room?.photos[idx];
  const url = useObjectUrl(current?.blob);
  const step = (d: number) => setI((v) => v + d);

  useEffect(() => setI(0), [roomId]);
  useEffect(() => {
    if (!playing || n < 2) return;
    const t = window.setInterval(() => setI((v) => v + 1), 5000);
    return () => window.clearInterval(t);
  }, [playing, n]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === ' ' && hall.current?.contains(document.activeElement)) {
        e.preventDefault();
        setPlaying((p) => !p);
      }
    };
    const onFs = () => setFull(document.fullscreenElement === hall.current);
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFs);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFs);
    };
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void hall.current?.requestFullscreen?.().catch(() => undefined);
  };

  if (!room)
    return (
      <div className="gr-empty">
        <p>The gallery opens once you have developed photos. Favourites and albums each get their own room.</p>
      </div>
    );

  const landscape = current ? current.width >= current.height : true;
  return (
    <div className="gr">
      <div className="gr-rooms" role="tablist" aria-label="Rooms">
        {rooms.map((r) => (
          <button key={r.id} type="button" role="tab" aria-selected={r.id === room.id} className={r.id === room.id ? 'is-active' : ''} onClick={() => setRoomId(r.id)}>
            <b>{r.name}</b>
            <small>{r.photos.length}</small>
          </button>
        ))}
      </div>
      <div
        ref={hall}
        className={`gr-hall ${full ? 'is-full' : ''}`}
        tabIndex={0}
        onPointerDown={(e) => (swipe.current = e.clientX)}
        onPointerUp={(e) => {
          if (swipe.current !== null && Math.abs(e.clientX - swipe.current) > 50) step(e.clientX < swipe.current ? 1 : -1);
          swipe.current = null;
        }}
      >
        <span className="gr-light" aria-hidden="true" />
        <div className="gr-stage">
          {current && (
            <figure className={`gr-frame ${landscape ? 'is-wide' : 'is-tall'}`} key={current.id}>
              <span className="gr-mat">{url && <img src={url} alt={current.name} draggable={false} />}</span>
            </figure>
          )}
          {current && (
            <aside className="gr-plaque" key={`p${current.id}`}>
              <b>{current.name}</b>
              <span>{new Date(current.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</span>
              <small>{cameraOf(current)?.name ?? current.filterName}</small>
              <em>
                {room.name} · {idx + 1} / {n}
              </em>
            </aside>
          )}
        </div>
        <div className="gr-controls">
          <button type="button" onClick={() => step(-1)} aria-label="Previous" disabled={n < 2}>
            <ChevronLeft size={18} />
          </button>
          <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} disabled={n < 2} className="is-play">
            {playing ? <Pause size={16} /> : <Play size={16} />}
            <span>{playing ? 'Pause' : 'Slideshow'}</span>
          </button>
          <button type="button" onClick={() => step(1)} aria-label="Next" disabled={n < 2}>
            <ChevronRight size={18} />
          </button>
          <button type="button" onClick={toggleFull} aria-label={full ? 'Leave full screen' : 'Full screen'}>
            {full ? <Shrink size={16} /> : <Expand size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
