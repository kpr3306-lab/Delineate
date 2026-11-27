import { Camera } from 'lucide-react';
import { useMemo } from 'react';
import type { PhotoRecord } from '../../types';
import { CAMERAS, COLLECTIONS, type CollectionId } from '../../lib/cameras';
import { passportStats } from '../../lib/memories';
import { pad } from '../../lib/utils';

const INK: Record<CollectionId, string> = { delineate: '#c4552a', digi: '#b8452c', mobile: '#2c5fa8', pocket: '#2f7d5b', film: '#8a4fb0', lab: '#b07d1e' };
const SHAPE: Record<CollectionId, string> = { delineate: 'hex', digi: 'round', mobile: 'rect', pocket: 'oval', film: 'round', lab: 'hex' };
const short = (t: number) => new Date(t).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase();

/** Camera Passport: a stamp for every body you have shot with, and the ones still waiting. */
export default function Passport({ photos, onUseCamera }: { photos: PhotoRecord[]; onUseCamera: (id: string) => void }) {
  const stats = useMemo(() => passportStats(photos), [photos]);
  const total = CAMERAS.length;
  return (
    <div className="pp">
      <section className="pp-id" aria-label="Passport summary">
        <div className="pp-id-cover">
          <span className="pp-crest" aria-hidden="true">
            <Camera size={26} strokeWidth={1.4} />
          </span>
          <strong>Camera Passport</strong>
          <small>DELINEATE · ISSUED TO THE BEARER</small>
        </div>
        <dl className="pp-stats">
          <div>
            <dt>Cameras explored</dt>
            <dd>
              {stats.explored}
              <small>/{total}</small>
            </dd>
          </div>
          <div>
            <dt>Frames shot</dt>
            <dd>{stats.shots}</dd>
          </div>
          <div>
            <dt>Rolls finished</dt>
            <dd>{stats.rolls}<small> × 36</small></dd>
          </div>
          <div>
            <dt>Favourites</dt>
            <dd>{stats.favorites}</dd>
          </div>
          <div className="is-wide">
            <dt>Most loved camera</dt>
            <dd className="is-text">{stats.topCamera?.name ?? '—'}</dd>
          </div>
          <div className="is-wide">
            <dt>Favourite look</dt>
            <dd className="is-text">{stats.topLook ?? '—'}</dd>
          </div>
        </dl>
        <div className="pp-progress" aria-label={`${stats.explored} of ${total} cameras explored`}>
          <i style={{ width: `${(stats.explored / total) * 100}%` }} />
        </div>
      </section>

      {COLLECTIONS.map((col) => (
        <section key={col.id} className="pp-page" aria-label={col.name}>
          <header>
            <h3>{col.name}</h3>
            <span>{col.note}</span>
          </header>
          <div className="pp-stamps">
            {CAMERAS.filter((c) => c.collection === col.id).map((cam, i) => {
              const s = stats.perCamera.get(cam.id);
              return (
                <button
                  key={cam.id}
                  type="button"
                  className={`pp-stamp is-${SHAPE[col.id]} ${s ? 'is-stamped' : ''}`}
                  style={{ ['--ink' as string]: INK[col.id], ['--tilt' as string]: `${((i * 37) % 11) - 5}deg` }}
                  onClick={() => onUseCamera(cam.id)}
                  title={s ? `Shoot with the ${cam.name} again` : `Try the ${cam.name}`}
                >
                  <span className="pp-stamp-ink">
                    <small>{cam.model}</small>
                    <b>{cam.name}</b>
                    {s ? (
                      <>
                        <em>{pad(s.count, 2)} {s.count === 1 ? 'FRAME' : 'FRAMES'}</em>
                        <small>{short(s.first)}</small>
                      </>
                    ) : (
                      <em>NOT YET</em>
                    )}
                  </span>
                  <span className="pp-stamp-cta">{s ? 'Shoot again →' : 'Try it →'}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
