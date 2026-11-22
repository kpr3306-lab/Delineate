import { HardDrive, ImagePlus, Lock, MailOpen, Plus, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { Capsule, Collection, PhotoRecord } from '../../types';
import { uid } from '../../lib/utils';
import { playSuccess } from '../../lib/audio';
import { Modal, PhotoPicker, Thumb } from '../ui';

const DAY = 86400000;
const startOfDay = (t: number) => {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};
const isoDay = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const longDate = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const until = (t: number) => {
  const days = Math.ceil((t - Date.now()) / DAY);
  if (days <= 1) return 'tomorrow';
  if (days < 60) return `in ${days} days`;
  const months = Math.round(days / 30.4);
  if (months < 24) return `in ${months} months`;
  return `in ${Math.round(days / 365)} years`;
};

/** Time Capsules: a sealed bundle of photos and a note, locked on this device until a chosen day. */
export default function Capsules({
  photos,
  capsules,
  onSave,
  onDelete,
  onBackup,
}: {
  photos: PhotoRecord[];
  capsules: Capsule[];
  onSave: (c: Collection) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onBackup: () => void;
}) {
  const [draft, setDraft] = useState<{ name: string; note: string; openAt: string; photoIds: string[] } | null>(null);
  const [picking, setPicking] = useState(false);
  const [viewing, setViewing] = useState<Capsule | null>(null);
  const [removing, setRemoving] = useState<Capsule | null>(null);
  const tomorrow = isoDay(Date.now() + DAY);
  const sorted = [...capsules].sort((a, b) => a.openAt - b.openAt);
  const ready = (c: Capsule) => !c.openedAt && Date.now() >= c.openAt;

  const seal = () => {
    if (!draft) return;
    const openAt = startOfDay(new Date(`${draft.openAt}T00:00:00`).getTime());
    void onSave({
      id: uid(),
      type: 'capsule',
      name: draft.name.trim().slice(0, 60) || 'A time capsule',
      note: draft.note.slice(0, 4000),
      photoIds: draft.photoIds,
      sealedAt: Date.now(),
      openAt,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    setDraft(null);
    playSuccess();
  };
  const open = (c: Capsule) => {
    const opened = { ...c, openedAt: Date.now(), updatedAt: Date.now() };
    void onSave(opened);
    setViewing(opened);
    playSuccess();
  };

  return (
    <div className="tc">
      <div className="tc-intro">
        <p>
          Seal a few photos and a note, choose a day, and they stay hidden until then — even from you. Capsules live only on this device:
          clearing browser data deletes them, so keep a backup.
        </p>
        <div className="tc-intro-actions">
          <button type="button" className="button button-outline" onClick={onBackup}>
            <HardDrive size={14} /> Backup & storage
          </button>
          <button type="button" className="button button-dark" onClick={() => setDraft({ name: '', note: '', openAt: isoDay(Date.now() + 365 * DAY), photoIds: [] })}>
            <Plus size={15} /> New capsule
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className="tc-empty">
          <span className="tc-envelope is-ghost" aria-hidden="true" />
          <p>No capsules yet. Seal one for a birthday, the end of a trip, or a year from today.</p>
        </div>
      ) : (
        <div className="tc-grid">
          {sorted.map((c) => {
            const state = c.openedAt ? 'opened' : ready(c) ? 'ready' : 'sealed';
            return (
              <article key={c.id} className={`tc-card is-${state}`}>
                <div className="tc-envelope" aria-hidden="true">
                  <i className="tc-flap" />
                  <i className="tc-seal">{state === 'opened' ? '' : 'D'}</i>
                </div>
                <div className="tc-body">
                  <h4>{c.name}</h4>
                  <p>
                    {state === 'sealed' && (
                      <>
                        <Lock size={12} /> Opens {until(c.openAt)} · {longDate(c.openAt)}
                      </>
                    )}
                    {state === 'ready' && <>Ready to open since {longDate(c.openAt)}</>}
                    {state === 'opened' && <>Opened {longDate(c.openedAt!)} · sealed {longDate(c.sealedAt)}</>}
                  </p>
                  <small>
                    {c.photoIds.length} {c.photoIds.length === 1 ? 'photo' : 'photos'}
                    {c.note ? ' · a note' : ''}
                  </small>
                </div>
                <div className="tc-card-actions">
                  {state === 'ready' && (
                    <button type="button" className="button button-dark" onClick={() => open(c)}>
                      <MailOpen size={14} /> Open
                    </button>
                  )}
                  {state === 'opened' && (
                    <button type="button" className="button button-outline" onClick={() => setViewing(c)}>
                      <MailOpen size={14} /> Read
                    </button>
                  )}
                  <button type="button" className="round-icon" onClick={() => setRemoving(c)} aria-label={`Delete ${c.name}`}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {draft && (
        <Modal title="Seal a time capsule" eyebrow="Memories / Time capsule" onClose={() => setDraft(null)}>
          <div className="tc-form">
            <label>
              <span>Name</span>
              <input className="text-input" value={draft.name} maxLength={60} placeholder="Summer 2026" onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label>
              <span>A note to your future self</span>
              <textarea className="text-input tc-note" value={draft.note} maxLength={4000} rows={4} placeholder="Dear future me…" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
            </label>
            <label>
              <span>Opens on</span>
              <input className="text-input" type="date" min={tomorrow} value={draft.openAt} onChange={(e) => setDraft({ ...draft, openAt: e.target.value })} />
            </label>
            <div className="tc-picked">
              {draft.photoIds.map((id) => {
                const p = photos.find((x) => x.id === id);
                return p ? (
                  <span key={id} className="tc-picked-item">
                    <Thumb photo={p} />
                    <button type="button" onClick={() => setDraft({ ...draft, photoIds: draft.photoIds.filter((x) => x !== id) })} aria-label={`Remove ${p.name}`}>
                      <X size={11} />
                    </button>
                  </span>
                ) : null;
              })}
              <button type="button" className="tc-add" onClick={() => setPicking(true)}>
                <ImagePlus size={16} />
                <span>Add photos</span>
              </button>
            </div>
            <p className="tc-fine">Once sealed you will not see the photos or note until {draft.openAt ? longDate(new Date(`${draft.openAt}T00:00:00`).getTime()) : 'the day'}. The photos also stay in your archive.</p>
          </div>
          <div className="modal-actions">
            <button type="button" className="button button-outline" onClick={() => setDraft(null)}>Cancel</button>
            <button type="button" className="button button-dark" onClick={seal} disabled={!draft.openAt || draft.openAt < tomorrow || (!draft.photoIds.length && !draft.note.trim())}>
              <Lock size={14} /> Seal capsule
            </button>
          </div>
        </Modal>
      )}
      {picking && draft && (
        <PhotoPicker
          photos={photos}
          title="Choose photos for the capsule"
          selected={draft.photoIds}
          onPick={(id) => setDraft((d) => (d ? { ...d, photoIds: d.photoIds.includes(id) ? d.photoIds.filter((x) => x !== id) : [...d.photoIds, id] } : d))}
          onClose={() => setPicking(false)}
        />
      )}
      {viewing && (
        <Modal title={viewing.name} eyebrow={`Sealed ${longDate(viewing.sealedAt)}`} wide onClose={() => setViewing(null)}>
          {viewing.note && <p className="tc-letter">{viewing.note}</p>}
          <div className="tc-photos">
            {viewing.photoIds.map((id) => {
              const p = photos.find((x) => x.id === id);
              return p ? <Thumb key={id} photo={p} /> : null;
            })}
          </div>
          {viewing.photoIds.some((id) => !photos.some((p) => p.id === id)) && <p className="tc-fine">Some photos in this capsule were deleted from the archive after it was sealed.</p>}
        </Modal>
      )}
      {removing && (
        <Modal title="Delete this capsule?" eyebrow="Memories / Time capsule" onClose={() => setRemoving(null)}>
          <p className="modal-copy">
            <strong>{removing.name}</strong> and its note will be deleted{removing.openedAt ? '' : ' without being opened'}. The photos stay in your archive.
          </p>
          <div className="modal-actions">
            <button type="button" className="button button-dark" onClick={() => setRemoving(null)}>Keep it</button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                void onDelete(removing.id);
                setRemoving(null);
              }}
            >
              <Trash2 size={14} /> Delete capsule
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
