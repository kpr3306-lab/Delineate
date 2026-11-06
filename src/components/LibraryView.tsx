import JSZip from 'jszip';
import {
  Archive,
  ChevronDown,
  Download,
  ImagePlus,
  FlaskConical,
  Heart,
  Lock,
  PackageOpen,
  Pencil,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState, type MouseEvent } from 'react';
import type { PhotoKind, PhotoRecord } from '../types';
import { downloadBlob, fileSlug, formatDate, pad } from '../lib/utils';
import { EmptyState, Modal, Spinner, useObjectUrl } from './ui';

type LibraryViewProps = {
  photos: PhotoRecord[];
  onEdit: (record: PhotoRecord) => void;
  onArt: (record: PhotoRecord) => void;
  onDevelop: (record: PhotoRecord) => void;
  onFavorite: (record: PhotoRecord) => void;
  onDelete: (id: string) => Promise<void>;
  onImport: () => void;
  onCamera: () => void;
  notify: (message: string, tone?: 'default' | 'warning') => void;
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

function ArchiveCard({
  record,
  index,
  onEdit,
  onArt,
  onDevelop,
  onFavorite,
  onDelete,
}: {
  record: PhotoRecord;
  index: number;
  onEdit: (record: PhotoRecord) => void;
  onArt: (record: PhotoRecord) => void;
  onDevelop: (record: PhotoRecord) => void;
  onFavorite: (record: PhotoRecord) => void;
  onDelete: (record: PhotoRecord) => void;
}) {
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

  const download = () =>
    downloadBlob(record.blob, `${fileSlug(record.name)}.${extensionFor(record)}`);

  // Touch screens have no hover: the first tap on the photo reveals the actions, a second tap hides them.
  const [open, setOpen] = useState(false);
  const toggleActions = (event: MouseEvent<HTMLDivElement>) => {
    if (!window.matchMedia('(hover: none)').matches || (event.target as HTMLElement).closest('button')) return;
    setOpen((o) => !o);
  };

  return (
    <article className={`archive-card ${open ? 'is-open' : ''}`} style={{ animationDelay: `${Math.min(index, 9) * 45}ms` }}>
      <div className="archive-image-wrap" onClick={toggleActions}>
        {url && <img src={url} alt={record.name} loading="lazy" className={negative ? 'is-negative' : ''} />}
        <button
          type="button"
          className={`archive-fav ${record.favorite ? 'is-on' : ''}`}
          onClick={() => onFavorite(record)}
          aria-pressed={Boolean(record.favorite)}
          aria-label={record.favorite ? 'Remove from favourites' : 'Add to favourites'}
        >
          <Heart size={14} />
        </button>
        <div className="archive-shade" />
        <div className="archive-topline">
          <span className={`archive-kind ${isAnimated ? 'is-animated' : ''}`}>{kindLabel}</span>
          {isAnimated && <span className="archive-gif">LOOP</span>}
        </div>
        <div className="archive-actions">
          {negative ? (
            <button type="button" title="Develop in the darkroom" onClick={() => onDevelop(record)}>
              <FlaskConical size={15} />
              <span>Develop</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                title={record.process ? 'Re-edit processing settings' : 'Edit in Processing'}
                onClick={() => onEdit(record)}
                disabled={record.kind === 'animated'}
              >
                <Pencil size={15} />
                <span>{record.process ? 'Re-edit' : 'Edit'}</span>
              </button>
              <button type="button" title="Open in art lab" onClick={() => onArt(record)}>
                <Sparkles size={15} />
                <span>Art</span>
              </button>
            </>
          )}
          <button type="button" title="Download" onClick={download}>
            <Download size={15} />
            <span>Save</span>
          </button>
          <button type="button" title="Delete" className="danger" onClick={() => onDelete(record)}>
            <Trash2 size={15} />
            <span>Delete</span>
          </button>
        </div>
      </div>
      <div className="archive-caption">
        <div>
          <strong>{record.name}</strong>
          <span>
            {formatDate(record.createdAt)} · {record.filterName}
          </span>
        </div>
        <button className="caption-download" type="button" onClick={download} aria-label="Download photo">
          <Download size={14} />
        </button>
      </div>
      <span className="archive-tape" aria-hidden="true" />
    </article>
  );
}

export default function LibraryView({
  photos,
  onEdit,
  onArt,
  onDevelop,
  onFavorite,
  onDelete,
  onImport,
  onCamera,
  notify,
}: LibraryViewProps) {
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
  const [pendingDelete, setPendingDelete] = useState<PhotoRecord | null>(null);
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
  }, [photos, filter, query, sort]);

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await onDelete(pendingDelete.id);
      notify(`${pendingDelete.name} removed from your private archive.`);
      setPendingDelete(null);
    } catch {
      notify('Could not remove this frame.', 'warning');
    } finally {
      setDeleting(false);
    }
  };

  const exportAll = async () => {
    if (!photos.length || exporting) return;
    setExporting(true);
    try {
      const zip = new JSZip();
      photos.forEach((photo, index) => {
        const name = `${pad(index + 1, 3)}-${fileSlug(photo.name)}.${extensionFor(photo)}`;
        zip.file(name, photo.blob);
      });
      const blob = await zip.generateAsync({ type: 'blob' });
      downloadBlob(blob, `delineate-archive-${new Date().toISOString().slice(0, 10)}.zip`);
      notify(`${photos.length} frames packed into a downloadable archive.`);
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

      {filtered.length ? (
        <div className={`archive-grid view-${view}`}>
          {filtered.map((photo, index) => (
            <ArchiveCard
              key={photo.id}
              record={photo}
              index={index}
              onEdit={onEdit}
              onArt={onArt}
              onDevelop={onDevelop}
              onFavorite={onFavorite}
              onDelete={(record) => setPendingDelete(record)}
            />
          ))}
        </div>
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

      {pendingDelete && (
        <Modal
          title="Remove this frame?"
          eyebrow="Archive / Delete"
          onClose={() => !deleting && setPendingDelete(null)}
        >
          <p className="modal-copy">
            <strong>{pendingDelete.name}</strong> will be removed from your private archive. If you
            want to keep a copy outside the studio, download it first.
          </p>
          <div className="modal-actions">
            <button
              type="button"
              className="button button-outline"
              onClick={() =>
                downloadBlob(
                  pendingDelete.blob,
                  `${fileSlug(pendingDelete.name)}.${extensionFor(pendingDelete)}`,
                )
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
              {deleting ? 'Removing…' : 'Delete frame'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
