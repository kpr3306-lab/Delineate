import { Check, FolderPlus } from 'lucide-react';
import { useState } from 'react';
import type { Album, Collection } from '../types';
import { uid } from '../lib/utils';
import { Modal } from './ui';

/** Put photos into (or take them out of) any number of albums, or start a new album with them. */
export default function AlbumPicker({
  photoIds,
  albums,
  onSave,
  onClose,
}: {
  photoIds: string[];
  albums: Album[];
  onSave: (c: Collection) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  // an album counts as "on" when it already holds every chosen photo; toggling adds the missing ones or takes them all out
  const holdsAll = (a: Album) => photoIds.every((id) => a.photoIds.includes(id));
  const toggle = (a: Album) => {
    const next = holdsAll(a) ? a.photoIds.filter((id) => !photoIds.includes(id)) : [...a.photoIds, ...photoIds.filter((id) => !a.photoIds.includes(id))];
    void onSave({ ...a, photoIds: next, coverId: next.includes(a.coverId ?? '') ? a.coverId : next[0], updatedAt: Date.now() });
  };
  const create = () => {
    const n = name.trim();
    if (!n) return;
    void onSave({ id: uid(), type: 'album', name: n.slice(0, 48), photoIds: [...photoIds], coverId: photoIds[0], createdAt: Date.now(), updatedAt: Date.now() });
    setName('');
  };
  return (
    <Modal title="Add to album" eyebrow="Archive / Albums" onClose={onClose}>
      <div className="alb-pick">
        {albums.length === 0 && <p className="modal-copy">No albums yet — name your first one below.</p>}
        {albums.map((a) => {
          const on = holdsAll(a);
          return (
            <button key={a.id} type="button" className={`alb-pick-row ${on ? 'is-on' : ''}`} onClick={() => toggle(a)} aria-pressed={on}>
              <i>{on && <Check size={13} />}</i>
              <span>{a.name}</span>
              <small>{a.photoIds.length}</small>
            </button>
          );
        })}
        <form
          className="alb-pick-new"
          onSubmit={(e) => {
            e.preventDefault();
            create();
          }}
        >
          <input className="text-input" value={name} maxLength={48} placeholder="New album name" aria-label="New album name" onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="button button-outline" disabled={!name.trim()}>
            <FolderPlus size={14} /> Create
          </button>
        </form>
      </div>
      <div className="modal-actions">
        <button type="button" className="button button-dark" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
