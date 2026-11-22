import { BookOpen, Download, ImagePlus, RotateCcw, Star, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { Collection, JournalBook, PhotoRecord, Yearbook } from '../../types';
import { getAllJournals } from '../../lib/db';
import { MONTHS, draftSelection, renderYearbook, yearbookPdf, yearsOf } from '../../lib/memories';
import { downloadBlob, uid } from '../../lib/utils';
import { PhotoPicker, Thumb } from '../ui';

/** Annual Yearbook: a curated recap of a year, edited here and exported as a multi-page PDF. */
export default function YearbookView({
  photos,
  books,
  onSave,
  notify,
}: {
  photos: PhotoRecord[];
  books: Yearbook[];
  onSave: (c: Collection) => Promise<void>;
  notify: (m: string, tone?: 'default' | 'warning') => void;
}) {
  const kept = useMemo(() => photos.filter((p) => p.developed !== false && p.kind !== 'animated'), [photos]);
  const years = useMemo(() => yearsOf(kept), [kept]);
  const [year, setYear] = useState(years[0] ?? new Date().getFullYear());
  const [book, setBook] = useState<Yearbook | null>(null);
  const [journals, setJournals] = useState<JournalBook[]>([]);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<string[]>([]);
  const inYear = useMemo(() => kept.filter((p) => new Date(p.createdAt).getFullYear() === year), [kept, year]);

  useEffect(() => {
    getAllJournals().then(setJournals, () => setJournals([]));
  }, []);
  // open this year's book, or draft a first one
  useEffect(() => {
    const saved = books.find((b) => b.year === year);
    setBook(
      saved ?? {
        id: uid(),
        type: 'yearbook',
        year,
        title: 'A year, kept',
        subtitle: 'Delineate · Yearbook',
        photoIds: draftSelection(kept, year),
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    );
    setPreviews([]);
    // re-draft only when the year changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);
  const edit = (p: Partial<Yearbook>) => {
    setBook((b) => {
      if (!b) return b;
      const next = { ...b, ...p, updatedAt: Date.now() };
      void onSave(next);
      return next;
    });
    setPreviews([]);
  };

  if (!years.length) return <div className="yb-empty"><p>A yearbook gathers a year of developed photos. Take and develop a few first.</p></div>;
  if (!book) return null;
  const chosen = book.photoIds.map((id) => kept.find((p) => p.id === id)).filter((p): p is PhotoRecord => Boolean(p)).sort((a, b) => a.createdAt - b.createdAt);
  const pageCount = 2 + MONTHS.reduce((n, _, m) => n + Math.ceil(chosen.filter((p) => new Date(p.createdAt).getMonth() === m).length / 4), 0);

  const preview = async () => {
    setBusy('Laying out pages…');
    try {
      const pages = await renderYearbook({ book, photos: kept, journals }, (i, n) => setBusy(`Laying out page ${i} of ${n}…`));
      setPreviews(
        pages.map((c) => {
          const t = document.createElement('canvas');
          t.width = 310;
          t.height = 438;
          t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
          return t.toDataURL('image/jpeg', 0.8);
        }),
      );
    } finally {
      setBusy(null);
    }
  };
  const exportPdf = async () => {
    setBusy('Binding the book…');
    try {
      const pdf = await yearbookPdf({ book, photos: kept, journals }, (i, n) => setBusy(`Printing page ${i} of ${n}…`));
      downloadBlob(pdf, `delineate-yearbook-${book.year}.pdf`);
      notify(`Yearbook ${book.year} exported — ${pageCount} pages.`);
    } catch (error) {
      console.error(error);
      notify('The yearbook could not be exported.', 'warning');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="yb">
      <div className="yb-years" role="tablist" aria-label="Year">
        {years.map((y) => (
          <button key={y} type="button" role="tab" aria-selected={y === year} className={y === year ? 'is-active' : ''} onClick={() => setYear(y)}>
            {y}
          </button>
        ))}
      </div>
      <div className="yb-work">
        <section className="yb-cover" aria-label="Cover">
          <div className="yb-cover-art">
            {(() => {
              const c = kept.find((p) => p.id === book.coverId) ?? chosen.find((p) => p.favorite) ?? chosen[0];
              return c ? <Thumb photo={c} /> : <span className="yb-cover-blank" />;
            })()}
            <div className="yb-cover-type">
              <strong>{book.year}</strong>
              <em>{book.title || 'A year, kept'}</em>
            </div>
          </div>
          <label>
            <span>Title</span>
            <input className="text-input" value={book.title} maxLength={60} onChange={(e) => edit({ title: e.target.value })} />
          </label>
          <label>
            <span>Subtitle</span>
            <input className="text-input" value={book.subtitle} maxLength={60} onChange={(e) => edit({ subtitle: e.target.value })} />
          </label>
          <p className="yb-meta">
            {chosen.length} photos · {pageCount} pages · {journals.filter((j) => new Date(j.updatedAt).getFullYear() === year).length} journals noted
          </p>
          <div className="yb-actions">
            <button type="button" className="button button-outline" onClick={() => void preview()} disabled={Boolean(busy) || !chosen.length}>
              <BookOpen size={14} /> Preview pages
            </button>
            <button type="button" className="button button-dark" onClick={() => void exportPdf()} disabled={Boolean(busy) || !chosen.length}>
              <Download size={14} /> Export PDF
            </button>
          </div>
          {busy && <p className="yb-busy">{busy}</p>}
        </section>

        <section className="yb-pick" aria-label="Photos in the book">
          <header>
            <h3>In the book</h3>
            <span>Tap ★ to make a photo the cover.</span>
            <div className="yb-pick-actions">
              <button type="button" className="button button-outline" onClick={() => setPicking(true)}>
                <ImagePlus size={14} /> Add / remove
              </button>
              <button type="button" className="button button-outline" onClick={() => edit({ photoIds: draftSelection(kept, year), coverId: undefined })} title="Start again from favourites and an even spread through the year">
                <RotateCcw size={14} /> Redraft
              </button>
            </div>
          </header>
          {chosen.length ? (
            <div className="yb-months">
              {MONTHS.map((m, i) => {
                const list = chosen.filter((p) => new Date(p.createdAt).getMonth() === i);
                if (!list.length) return null;
                return (
                  <div key={m} className="yb-month">
                    <h4>{m}</h4>
                    <div className="yb-thumbs">
                      {list.map((p) => (
                        <span key={p.id} className={`yb-thumb ${book.coverId === p.id ? 'is-cover' : ''}`}>
                          <Thumb photo={p} />
                          <button type="button" className="yb-star" onClick={() => edit({ coverId: p.id })} aria-label={`Use ${p.name} as the cover`}>
                            <Star size={11} />
                          </button>
                          <button type="button" className="yb-x" onClick={() => edit({ photoIds: book.photoIds.filter((x) => x !== p.id) })} aria-label={`Remove ${p.name}`}>
                            <X size={11} />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="yb-meta">No photos in this book yet. Add some, or redraft from the year.</p>
          )}
        </section>
      </div>

      {previews.length > 0 && (
        <section className="yb-preview" aria-label="Page preview">
          {previews.map((src, i) => (
            <figure key={i}>
              <img src={src} alt={`Page ${i + 1}`} />
              <figcaption>{i === 0 ? 'Cover' : i === previews.length - 1 ? 'In numbers' : `Page ${i + 1}`}</figcaption>
            </figure>
          ))}
        </section>
      )}

      {picking && (
        <PhotoPicker
          photos={inYear}
          title={`Photos from ${year}`}
          selected={book.photoIds}
          onPick={(id) => edit({ photoIds: book.photoIds.includes(id) ? book.photoIds.filter((x) => x !== id) : [...book.photoIds, id] })}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
