import JSZip from 'jszip';
import {
  Archive,
  Check,
  CheckSquare,
  ChevronDown,
  Download,
  FolderPlus,
  ImagePlus,
  Heart,
  Lock,
  PackageOpen,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Album, Collection, PhotoKind, PhotoRecord } from '../types';
import { downloadBlob, fileSlug, formatDate, pad } from '../lib/utils';
import { EmptyState, Modal, Spinner, Thumb, useObjectUrl, type ToastAction } from './ui';
import AlbumPicker from './AlbumPicker';
import PhotoViewer from './PhotoViewer';
import TidyUp from './TidyUp';

type LibraryViewProps = {
  photos: PhotoRecord[];
  onEdit: (record: PhotoRecord) => void;
  onArt: (record: PhotoRecord) => void;
  onFrame: (record: PhotoRecord) => void;
  onDevelop: (record: PhotoRecord) => void;
  onFavorite: (record: PhotoRecord) => void;
  onRename: (record: PhotoRecord, name: string) => void;
  onDelete: (id: string) => Promise<void>;
  onImport: () => void;
  onCamera: () => void;
  notify: (message: string, tone?: 'default' | 'warning', action?: ToastAction) => void;
  /** Put deleted frames back (Undo). */
  onRestore: (records: PhotoRecord[]) => Promise<void>;
  albums: Album[];
  onSaveCollection: (c: Collection) => Promise<void>;
  onDeleteCollection: (id: string) => Promise<void>;
};

const VIEWS = [
  { id: 'grid', label: 'Grid' },
  { id: 'compact', label: 'Compact' },
  { id: 'large', label: 'Large' },
  { id: 'contact', label: 'Contact sheet' },
  { id: 'wall', label: 'Polaroid wall' },
  { id: 'list', label: 'List' },
] as const;
type ViewKey = (typeof VIEWS)[number]['id'];

type FilterKey = 'all' | 'favorite' | 'negative' | PhotoKind;

const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'All frames',
  favorite: 'Favourites',
  negative: 'Undeveloped',
  still: 'Stills',
  collage: 'Collages',
  art: 'Art studies',
  animated: 'Animations',
};

const extensionFor = (record: PhotoRecord) => {
  if (record.mime.includes('gif')) return 'gif';
  if (record.mime.includes('png')) return 'png';
  return 'jpg';
};

function ArchiveCard({ record, index, onOpen, onFavorite, selected }: { record: PhotoRecord; index: number; onOpen: () => void; onFavorite: (record: PhotoRecord) => void; selected?: boolean }) {
  const url = useObjectUrl(record.blob);
  const isAnimated = record.kind === 'animated';
  const negative = record.developed === false;
  const kindLabel = negative
    ? 'NEG'
    : record.kind === 'animated'
      ? 'GIF'
      : record.kind === 'art'
        ? 'ART'
        : record.kind === 'collage'
          ? 'COL'
          : `${pad(index + 1, 2)}`;

  return (
    <article className={`archive-card ${selected !== undefined ? 'is-selecting' : ''} ${selected ? 'is-selected' : ''}`} style={{ animationDelay: `${Math.min(index, 9) * 45}ms` }}>
      <div className="archive-image-wrap">
        {/* a real tap (click) opens the viewer; a scroll that starts on the photo never does */}
        <button type="button" className="archive-open" onClick={onOpen} aria-label={selected === undefined ? `Open ${record.name}` : `${selected ? 'Deselect' : 'Select'} ${record.name}`} aria-pressed={selected}>
          {url && <img src={url} alt="" loading="lazy" className={negative ? 'is-negative' : ''} />}
          {selected !== undefined && <span className="archive-check" aria-hidden="true">{selected && <Check size={14} strokeWidth={3} />}</span>}
        </button>
        <button
          type="button"
          className={`archive-fav ${record.favorite ? 'is-on' : ''}`}
          onClick={() => onFavorite(record)}
          aria-pressed={Boolean(record.favorite)}
          aria-label={record.favorite ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Heart size={14} />
        </button>
        <div className="archive-topline">
          <span className={`archive-kind ${isAnimated ? 'is-animated' : ''}`}>{kindLabel}</span>
          {isAnimated && <span className="archive-gif">LOOP</span>}
        </div>
      </div>
      <div className="archive-caption">
        <div>
          <strong>{record.name}</strong>
          <span>
            {formatDate(record.createdAt)} · {record.filterName}
          </span>
        </div>
      </div>
      <span className="archive-tape" aria-hidden="true" />
    </article>
  );
}

export default function LibraryView({
  photos,
  onEdit,
  onArt,
  onFrame,
  onDevelop,
  onFavorite,
  onRename,
  onRestore,
  onDelete,
  onImport,
  onCamera,
  notify,
  albums,
  onSaveCollection,
  onDeleteCollection,
}: LibraryViewProps) {
  const [albumId, setAlbumId] = useState<string | null>(null);
  const [albumFor, setAlbumFor] = useState<string[] | null>(null);
  const [newAlbum, setNewAlbum] = useState<string | null>(null);
  const [albumDelete, setAlbumDelete] = useState<Album | null>(null);
  const album = albums.find((a) => a.id === albumId) ?? null;
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [view, setView] = useState<ViewKey>(() => {
    try {
      return (window.localStorage.getItem('delineate-archive-view') as ViewKey) || 'grid';
    } catch {
      return 'grid';
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem('delineate-archive-view', view);
    } catch {
      /* ignore */
    }
  }, [view]);
  const [pendingDelete, setPendingDelete] = useState<PhotoRecord[] | null>(null);
  // select mode: tapping a frame ticks it instead of opening it; the bar at the bottom acts on the ticked ones
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const pickedRecords = picked ? photos.filter((p) => picked.has(p.id)) : [];
  const togglePick = (id: string) =>
    setPicked((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  useEffect(() => {
    if (!picked) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !document.querySelector('.modal-overlay') && setPicked(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [picked]);
  const [viewIdx, setViewIdx] = useState<number | null>(null);
  const [tidying, setTidying] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const counts = useMemo(
    () => ({
      all: photos.length,
      still: photos.filter((photo) => photo.kind === 'still').length,
      art: photos.filter((photo) => photo.kind === 'art').length,
      animated: photos.filter((photo) => photo.kind === 'animated').length,
      collage: photos.filter((photo) => photo.kind === 'collage').length,
      favorite: photos.filter((photo) => photo.favorite).length,
      negative: photos.filter((photo) => photo.developed === false).length,
    }),
    [photos],
  );

  const filtered = useMemo(() => {
    const search = query.trim().toLowerCase();
    return photos
      .filter((photo) => !album || album.photoIds.includes(photo.id))
      .filter((photo) =>
        filter === 'all'
          ? true
          : filter === 'favorite'
            ? photo.favorite
            : filter === 'negative'
              ? photo.developed === false
              : photo.kind === filter,
      )
      .filter(
        (photo) =>
          !search ||
          photo.name.toLowerCase().includes(search) ||
          photo.filterName.toLowerCase().includes(search),
      )
      .sort((a, b) =>
        sort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt,
      );
  }, [photos, filter, query, sort, album]);
  // after a delete (or a filter change) keep the viewer on a frame that still exists
  useEffect(() => {
    if (viewIdx !== null && viewIdx >= filtered.length) setViewIdx(filtered.length ? filtered.length - 1 : null);
  }, [viewIdx, filtered.length]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    const gone = pendingDelete;
    try {
      for (const r of gone) await onDelete(r.id);
      notify(gone.length === 1 ? `${gone[0].name} removed.` : `${gone.length} frames removed.`, 'default', { label: 'Undo', run: () => void onRestore(gone) });
      setPendingDelete(null);
      setPicked(null);
    } catch {
      notify('Could not remove this frame.', 'warning');
    } finally {
      setDeleting(false);
    }
  };

  const exportAll = () => pack(photos, `delineate-archive-${new Date().toISOString().slice(0, 10)}.zip`);
  const pack = async (list: PhotoRecord[], fileName: string) => {
    if (!list.length || exporting) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      list.forEach((photo, index) => {
        const name = `${pad(index + 1, 3)}-${fileSlug(photo.name)}.${extensionFor(photo)}`;
        zip.file(name, photo.blob);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, fileName);
      notify(`${list.length} frames packed into a downloadable archive.`);
    } catch {
      notify('The archive could not be exported.', 'warning');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="archive-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Archive / 04</span>
          <p>A private roll of everything you chose to keep.</p>
        </div>
        <div className="privacy-pill">
          <Lock size={12} />
          Stored in this browser · Not in your camera roll
        </div>
      </div>

      <section className="archive-hero">
        <div className="archive-hero-copy">
          <h1>
            The <em>Archive</em>
          </h1>
          <p>
            Developed frames live here, separate from your device gallery. Download any frame —
            or the whole roll — whenever you want to set it free.
          </p>
        </div>
        <div className="archive-stats">
          <div>
            <strong>{pad(counts.all, 2)}</strong>
            <span>Frames kept</span>
          </div>
          <div>
            <strong>{pad(counts.art, 2)}</strong>
            <span>Art studies</span>
          </div>
          <div>
            <strong>{pad(counts.animated, 2)}</strong>
            <span>Animations</span>
          </div>
        </div>
      </section>

      <div className="archive-toolbar">
        <div className="archive-filters">
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              className={filter === key ? 'is-active' : ''}
              onClick={() => setFilter(key)}
            >
              {FILTER_LABELS[key]}
              <span>{counts[key]}</span>
            </button>
          ))}
        </div>
        <div className="segmented archive-views" role="radiogroup" aria-label="Display">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" role="radio" aria-checked={view === v.id} className={view === v.id ? 'is-active' : ''} onClick={() => setView(v.id)}>
              {v.label}
            </button>
          ))}
        </div>
        <div className="archive-tools">
          <label className="search-field">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the roll"
              aria-label="Search archive"
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Clear search">
                <X size={14} />
              </button>
            )}
          </label>
          <label className="select-field">
            <span>Order</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as 'newest' | 'oldest')}
            >
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
            </select>
            <ChevronDown size={14} />
          </label>
          <button
            type="button"
            className="button button-outline archive-export"
            onClick={() => void exportAll()}
            disabled={!photos.length || exporting}
          >
            {exporting ? <Spinner /> : <PackageOpen size={15} />}
            {exporting ? 'Packing…' : 'Export all'}
          </button>
          <button type="button" className="button button-dark" onClick={onImport}>
            <ImagePlus size={15} /> Import
          </button>
        </div>
      </div>

      <div className="alb-strip" role="tablist" aria-label="Albums">
        <button type="button" role="tab" aria-selected={!album} className={`alb-chip ${!album ? 'is-active' : ''}`} onClick={() => setAlbumId(null)}>
          <span className="alb-chip-cover is-all" aria-hidden="true" />
          <span>All photos</span>
          <small>{photos.length}</small>
        </button>
        {albums.map((a) => {
          const cover = photos.find((p) => p.id === a.coverId) ?? photos.find((p) => a.photoIds.includes(p.id));
          const count = photos.filter((p) => a.photoIds.includes(p.id)).length;
          return (
            <button key={a.id} type="button" role="tab" aria-selected={albumId === a.id} className={`alb-chip ${albumId === a.id ? 'is-active' : ''}`} onClick={() => setAlbumId(a.id)}>
              {cover ? <Thumb photo={cover} className="alb-chip-cover" /> : <span className="alb-chip-cover" aria-hidden="true" />}
              <span>{a.name}</span>
              <small>{count}</small>
            </button>
          );
        })}
        {newAlbum === null ? (
          <button type="button" className="alb-chip alb-new" onClick={() => setNewAlbum('')}>
            <FolderPlus size={14} /> New album
          </button>
        ) : (
          <form
            className="alb-new-form"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newAlbum.trim();
              if (!name) return setNewAlbum(null);
              const id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
              void onSaveCollection({ id, type: 'album', name: name.slice(0, 48), photoIds: [], createdAt: Date.now(), updatedAt: Date.now() }).then(() => setAlbumId(id));
              setNewAlbum(null);
              notify(`Album “${name}” created — add photos with the Album button on any frame.`);
            }}
          >
            <input className="text-input" autoFocus value={newAlbum} maxLength={48} placeholder="Album name" aria-label="Album name" onChange={(e) => setNewAlbum(e.target.value)} onBlur={() => !newAlbum.trim() && setNewAlbum(null)} />
            <button type="submit" className="button button-dark">Create</button>
          </form>
        )}
        {photos.length > 1 && (
          <button type="button" className="alb-chip alb-tidy" onClick={() => setTidying(true)}>
            <Sparkles size={14} /> Tidy up
          </button>
        )}
        {filtered.length > 0 && (
          <button type="button" className={`alb-chip alb-select ${picked ? 'is-active' : ''}`} onClick={() => setPicked((s) => (s ? null : new Set()))} aria-pressed={Boolean(picked)}>
            <CheckSquare size={14} /> {picked ? 'Cancel' : 'Select'}
          </button>
        )}
      </div>
      {album && (
        <div className="alb-head">
          <input
            className="alb-title"
            value={album.name}
            maxLength={48}
            aria-label="Album name"
            onChange={(e) => void onSaveCollection({ ...album, name: e.target.value, updatedAt: Date.now() })}
          />
          <span className="alb-count">{filtered.length} {filtered.length === 1 ? 'frame' : 'frames'}</span>
          <button type="button" className="button button-outline" onClick={() => setAlbumDelete(album)}>
            <Trash2 size={14} /> Delete album
          </button>
        </div>
      )}

      {filtered.length ? (
        <div className={`archive-grid view-${view}`}>
          {filtered.map((photo, index) => (
            <ArchiveCard key={photo.id} record={photo} index={index} onOpen={() => (picked ? togglePick(photo.id) : setViewIdx(index))} onFavorite={onFavorite} selected={picked ? picked.has(photo.id) : undefined} />
          ))}
        </div>
      ) : album && photos.length ? (
        <EmptyState
          icon={<FolderPlus size={26} />}
          title="This album is empty"
          body="Open All photos, then use the Album button on any frame to add it here."
          action={<button type="button" className="button button-outline" onClick={() => setAlbumId(null)}>Show all photos</button>}
        />
      ) : photos.length ? (
        <EmptyState
          icon={<Search size={26} />}
          title="No frames match that search"
          body="Try another name, filter stock, or switch the archive view."
          action={
            <button
              type="button"
              className="button button-outline"
              onClick={() => {
                setFilter('all');
                setQuery('');
              }}
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <EmptyState
          icon={<Archive size={28} />}
          title="Your archive is waiting for its first frame"
          body="Shoot something with the camera, import a favorite photograph, or conjure an art study. Everything is saved locally and stays yours."
          action={
            <div className="empty-actions">
              <button type="button" className="button button-dark" onClick={onCamera}>
                Open the camera
              </button>
              <button type="button" className="button button-outline" onClick={onImport}>
                <ImagePlus size={15} /> Import a photo
              </button>
            </div>
          }
        />
      )}

      <div className="archive-note">
        <Lock size={14} />
        <p>
          <strong>Private by default.</strong> Delineate keeps this archive in your browser's
          local storage. It is never uploaded. Clearing browser data will clear the archive, so
          download anything you want to keep forever.
        </p>
      </div>

      {viewIdx !== null && filtered[viewIdx] && (
        <PhotoViewer
          photos={filtered}
          index={viewIdx}
          onIndex={setViewIdx}
          onClose={() => setViewIdx(null)}
          onEdit={onEdit}
          onArt={onArt}
          onFrame={onFrame}
          onDevelop={onDevelop}
          onFavorite={onFavorite}
          onAlbum={(record) => setAlbumFor([record.id])}
          onSave={(record) => downloadBlob(record.fullRes ?? record.blob, `${fileSlug(record.name)}.${record.fullRes ? (record.fullRes.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg') : extensionFor(record)}`)}
          onDelete={(record) => setPendingDelete([record])}
          onRename={onRename}
        />
      )}
      {picked &&
        createPortal(
        <div className="arc-selbar" role="toolbar" aria-label="Selected frames">
          <span className="arc-selcount">{picked.size ? `${picked.size} selected` : 'Tap frames to select'}</span>
          <button type="button" onClick={() => setPicked(picked.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id)))}>
            <CheckSquare size={17} />
            <span>{picked.size === filtered.length ? 'None' : 'All'}</span>
          </button>
          <button type="button" disabled={!picked.size} onClick={() => setAlbumFor(pickedRecords.map((p) => p.id))}>
            <FolderPlus size={17} />
            <span>Album</span>
          </button>
          <button type="button" disabled={!picked.size || exporting} onClick={() => void pack(pickedRecords, `delineate-${pickedRecords.length}-frames.zip`)}>
            {exporting ? <Spinner /> : <Download size={17} />}
            <span>Save</span>
          </button>
          <button type="button" className="is-danger" disabled={!picked.size} onClick={() => setPendingDelete(pickedRecords)}>
            <Trash2 size={17} />
            <span>Delete</span>
          </button>
        </div>,
          document.querySelector('.app-shell') ?? document.body,
        )}
      {tidying && (
        <TidyUp
          photos={photos}
          onClose={() => setTidying(false)}
          onDelete={(records) => {
            setTidying(false);
            setPendingDelete(records);
          }}
        />
      )}
      {albumFor && <AlbumPicker photoIds={albumFor} albums={albums} onSave={onSaveCollection} onClose={() => setAlbumFor(null)} />}
      {albumDelete && (
        <Modal title="Delete this album?" eyebrow="Archive / Albums" onClose={() => setAlbumDelete(null)}>
          <p className="modal-copy">
            <strong>{albumDelete.name}</strong> will be removed. The photos in it stay in your archive.
          </p>
          <div className="modal-actions">
            <button type="button" className="button button-dark" onClick={() => setAlbumDelete(null)}>Keep it</button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => {
                void onDeleteCollection(albumDelete.id);
                setAlbumId(null);
                setAlbumDelete(null);
              }}
            >
              <Trash2 size={15} /> Delete album
            </button>
          </div>
        </Modal>
      )}
      {pendingDelete && (
        <Modal
          title={pendingDelete.length === 1 ? 'Remove this frame?' : `Remove ${pendingDelete.length} frames?`}
          eyebrow="Archive / Delete"
          onClose={() => !deleting && setPendingDelete(null)}
        >
          <p className="modal-copy">
            <strong>{pendingDelete.length === 1 ? pendingDelete[0].name : `${pendingDelete.length} frames`}</strong> will be removed from your private
            archive. You can undo it for a few seconds afterwards; to keep a copy outside the studio, download first.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={() =>
                pendingDelete.length === 1
                  ? downloadBlob(pendingDelete[0].blob, `${fileSlug(pendingDelete[0].name)}.${extensionFor(pendingDelete[0])}`)
                  : void pack(pendingDelete, `delineate-${pendingDelete.length}-frames.zip`)
              }
            >
              <Download size={15} /> Download first
            </button>
            <button type="button" className="button button-dark" onClick={() => setPendingDelete(null)}>
              Keep it
            </button>
            <button
              type="button"
              className="button button-danger"
              onClick={() => void confirmDelete()}
              disabled={deleting}
            >
              {deleting ? <Spinner /> : <Trash2 size={15} />}
              {deleting ? 'Removing…' : pendingDelete.length === 1 ? 'Delete frame' : `Delete ${pendingDelete.length}`}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
