import { CalendarHeart, FolderPlus, Heart, RefreshCcw, ShieldCheck, SkipForward } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Album, Collection, PhotoRecord } from '../../types';
import { HANDFUL, cameraOf, drawHandful, forgottenFrames, markSeen, onThisDay, readSeen } from '../../lib/memories';
import { Thumb, Toggle, useObjectUrl } from '../ui';
import AlbumPicker from '../AlbumPicker';

const ON_KEY = 'delineate-forgotten-on';
const ago = (t: number) => {
  const days = Math.floor((Date.now() - t) / 86400000);
  if (days < 1) return 'today';
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30.4);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
};

/** Forgotten Frames (opt-in) and On This Day. Nothing here ever deletes or uploads. */
export default function Rediscover({
  photos,
  albums,
  onSavePhoto,
  onSaveCollection,
}: {
  photos: PhotoRecord[];
  albums: Album[];
  onSavePhoto: (r: PhotoRecord) => Promise<void>;
  onSaveCollection: (c: Collection) => Promise<void>;
}) {
  const [on, setOn] = useState(() => {
    try {
      return window.localStorage.getItem(ON_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [skipped, setSkipped] = useState(0); // bump to re-read the seen list
  const [albumFor, setAlbumFor] = useState<string | null>(null);
  const [picks, setPicks] = useState(() => drawHandful(photos));
  // today's handful, minus anything already kept close or put to rest
  const queue = useMemo(() => {
    const seen = readSeen();
    return picks.map((id) => photos.find((p) => p.id === id)).filter((p): p is PhotoRecord => Boolean(p && !p.favorite && !seen.has(p.id)));
    // skipped re-reads the seen list
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, picks, skipped]);
  const more = useMemo(() => forgottenFrames(photos).length, [photos, skipped]);
  const current = queue[0];
  const url = useObjectUrl(current?.blob);
  const today = useMemo(() => onThisDay(photos), [photos]);
  const setOnSaved = (v: boolean) => {
    setOn(v);
    try {
      window.localStorage.setItem(ON_KEY, v ? '1' : '0');
    } catch {
      /* this visit only */
    }
  };
  const next = () => {
    if (current) markSeen(current.id);
    setSkipped((n) => n + 1);
  };

  return (
    <div className="rd">
      <section className="rd-main">
        <header className="rd-head">
          <div>
            <h3>Forgotten Frames</h3>
            <p>Each day, {HANDFUL} older photos you never favourited, picked at random and shown one at a time. Keep them close or let them rest — nothing is ever deleted or uploaded.</p>
          </div>
          <Toggle checked={on} onChange={setOnSaved} label="On" />
        </header>
        {!on ? (
          <div className="rd-optin">
            <ShieldCheck size={28} strokeWidth={1.4} />
            <p>Forgotten Frames is off. Turn it on to be shown a quiet reminder of photos you may have overlooked.</p>
            <button type="button" className="button button-dark" onClick={() => setOnSaved(true)}>
              Turn on Forgotten Frames
            </button>
          </div>
        ) : !current && more > 0 ? (
          <div className="rd-optin">
            <RefreshCcw size={26} strokeWidth={1.4} />
            <p>That was today’s handful. A fresh few will be waiting tomorrow.</p>
            <button type="button" className="button button-outline" onClick={() => setPicks(drawHandful(photos, true))}>
              Draw a few more
            </button>
          </div>
        ) : !current ? (
          <div className="rd-optin">
            <RefreshCcw size={26} strokeWidth={1.4} />
            <p>You have looked at every forgotten frame for now. New ones appear as your photos get older.</p>
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                try {
                  window.localStorage.removeItem('delineate-forgotten-seen');
                } catch {
                  /* ignore */
                }
                setPicks(drawHandful(photos, true));
                setSkipped((n) => n + 1);
              }}
            >
              Start over
            </button>
          </div>
        ) : (
          <div className="rd-stage">
            <figure className="rd-print" key={current.id}>
              {url && <img src={url} alt={current.name} />}
              <figcaption>
                <b>{current.name}</b>
                <span>
                  {ago(current.createdAt)} · {new Date(current.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                </span>
                <small>{cameraOf(current)?.name ?? current.filterName}</small>
              </figcaption>
            </figure>
            <div className="rd-actions">
              <button
                type="button"
                className="button button-dark"
                onClick={() => {
                  void onSavePhoto({ ...current, favorite: true });
                  next();
                }}
              >
                <Heart size={15} /> Keep close
              </button>
              <button type="button" className="button button-outline" onClick={() => setAlbumFor(current.id)}>
                <FolderPlus size={15} /> Add to album
              </button>
              <button type="button" className="button button-outline" onClick={next}>
                <SkipForward size={15} /> Not now
              </button>
              <span className="rd-left">{queue.length - 1 ? `${queue.length - 1} more today` : 'last one today'}</span>
            </div>
          </div>
        )}
      </section>

      <aside className="rd-side">
        <h3>
          <CalendarHeart size={16} /> On this day
        </h3>
        {today.length ? (
          <div className="rd-today">
            {today.slice(0, 9).map((p) => (
              <figure key={p.id}>
                <Thumb photo={p} />
                <figcaption>{new Date(p.createdAt).getFullYear()}</figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="rd-empty">Nothing from {new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long' })} in earlier years yet. Come back on this date next year.</p>
        )}
      </aside>

      {albumFor && <AlbumPicker photoIds={[albumFor]} albums={albums} onSave={onSaveCollection} onClose={() => setAlbumFor(null)} />}
    </div>
  );
}
