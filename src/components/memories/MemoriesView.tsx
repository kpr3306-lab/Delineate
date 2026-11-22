import { BookOpenText, Hourglass, Landmark, Pin, Sparkles, Stamp } from 'lucide-react';
import { useState } from 'react';
import type { Album, Capsule, Collection, PhotoRecord, Wall, Yearbook } from '../../types';
import Passport from './Passport';
import Rediscover from './Rediscover';
import Capsules from './Capsules';
import GalleryRoom from './GalleryRoom';
import MemoryWall from './MemoryWall';
import YearbookView from './YearbookView';

type Section = 'passport' | 'rediscover' | 'capsules' | 'room' | 'wall' | 'yearbook';
const SECTIONS: { id: Section; label: string; icon: typeof Stamp; blurb: string }[] = [
  { id: 'passport', label: 'Passport', icon: Stamp, blurb: 'Every camera you have shot with, stamped.' },
  { id: 'rediscover', label: 'Rediscover', icon: Sparkles, blurb: 'Forgotten frames and this day in years past.' },
  { id: 'capsules', label: 'Capsules', icon: Hourglass, blurb: 'Photos and a note, sealed until a day you choose.' },
  { id: 'room', label: 'Gallery', icon: Landmark, blurb: 'Your favourites and albums, hung one at a time.' },
  { id: 'wall', label: 'Wall', icon: Pin, blurb: 'Pin photos, notes, dates and tickets on a board.' },
  { id: 'yearbook', label: 'Yearbook', icon: BookOpenText, blurb: 'A year of photos, bound as a PDF.' },
];
const KEY = 'delineate-memories-section';

export type MemoriesProps = {
  photos: PhotoRecord[];
  allPhotos: PhotoRecord[];
  collections: Collection[];
  onSaveCollection: (c: Collection) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
  onSavePhoto: (r: PhotoRecord) => Promise<void>;
  onUseCamera: (id: string) => void;
  onBackup: () => void;
  notify: (m: string, tone?: 'default' | 'warning') => void;
};

/** Memories: the signature experiences, each a quiet room of its own. */
export default function MemoriesView(props: MemoriesProps) {
  const [section, setSection] = useState<Section>(() => {
    try {
      return (window.localStorage.getItem(KEY) as Section) || 'passport';
    } catch {
      return 'passport';
    }
  });
  const go = (s: Section) => {
    setSection(s);
    try {
      window.localStorage.setItem(KEY, s);
    } catch {
      /* this visit only */
    }
  };
  const { photos, collections } = props;
  const albums = collections.filter((c): c is Album => c.type === 'album');
  const capsules = collections.filter((c): c is Capsule => c.type === 'capsule');
  const walls = collections.filter((c): c is Wall => c.type === 'wall');
  const books = collections.filter((c): c is Yearbook => c.type === 'yearbook');
  const meta = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];

  return (
    <div className="memories-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Memories / 08</span>
          <p>{meta.blurb}</p>
        </div>
      </div>
      <nav className="mem-tabs" aria-label="Memories">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={section === s.id ? 'is-active' : ''} aria-current={section === s.id ? 'page' : undefined} onClick={() => go(s.id)}>
            <s.icon size={15} />
            <span>{s.label}</span>
          </button>
        ))}
      </nav>
      <div className="mem-body" key={section}>
        {section === 'passport' && <Passport photos={props.allPhotos} onUseCamera={props.onUseCamera} />}
        {section === 'rediscover' && <Rediscover photos={photos} albums={albums} onSavePhoto={props.onSavePhoto} onSaveCollection={props.onSaveCollection} />}
        {section === 'capsules' && <Capsules photos={photos} capsules={capsules} onSave={props.onSaveCollection} onDelete={props.onDeleteCollection} onBackup={props.onBackup} />}
        {section === 'room' && <GalleryRoom photos={photos} albums={albums} />}
        {section === 'wall' && (
          <MemoryWall photos={photos} walls={walls} onSave={props.onSaveCollection} onDelete={props.onDeleteCollection} onSavePhoto={props.onSavePhoto} notify={props.notify} />
        )}
        {section === 'yearbook' && <YearbookView photos={photos} books={books} onSave={props.onSaveCollection} notify={props.notify} />}
      </div>
    </div>
  );
}
