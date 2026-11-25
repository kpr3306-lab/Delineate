import { CalendarDays, FileDown, Images, LayoutGrid, Mail, Ruler } from 'lucide-react';
import { useState } from 'react';
import type { PhotoRecord } from '../types';
import { PAPERS } from '../lib/print';
import { CARD_SIZES, calendarPdf, cardPdf, contactSheetPdf, printScale, setPrintScale, testPagePdf } from '../lib/printProjects';
import { downloadBlob } from '../lib/utils';
import { Modal, PhotoPicker, Spinner, Thumb, Toggle } from './ui';

export type ProjectKind = 'card' | 'calendar' | 'contact' | 'test';
export const PROJECTS: { id: ProjectKind; label: string; note: string; icon: typeof Mail }[] = [
  { id: 'card', label: 'Greeting card', note: 'Folded, with your message inside', icon: Mail },
  { id: 'calendar', label: 'Photo calendar', note: 'Twelve months, one photo each', icon: CalendarDays },
  { id: 'contact', label: 'Contact sheet', note: 'A roll of frames on one page', icon: LayoutGrid },
  { id: 'test', label: 'Printer test page', note: 'Measure once, print true to size', icon: Ruler },
];
const SHEET_PAPERS = PAPERS.filter((p) => p.id === 'a4' || p.id === 'letter' || p.id === 'a3');

type Props = { kind: ProjectKind; photos: PhotoRecord[]; source: PhotoRecord | null; onClose: () => void; notify: (m: string, tone?: 'default' | 'warning') => void };

/** The extra print projects, each one a small form that downloads a PDF. */
export default function PrintProjects({ kind, photos, source, onClose, notify }: Props) {
  const meta = PROJECTS.find((p) => p.id === kind)!;
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [paperId, setPaperId] = useState('a4');
  const paper = PAPERS.find((p) => p.id === paperId)!;
  // card
  const [cardPhoto, setCardPhoto] = useState<PhotoRecord | null>(source ?? photos[0] ?? null);
  const [cardSize, setCardSize] = useState<(typeof CARD_SIZES)[number]['id']>('a6');
  const [message, setMessage] = useState('');
  const [font, setFont] = useState<'hand' | 'serif'>('hand');
  const [from, setFrom] = useState('');
  // calendar + contact sheet: chosen photos (empty = automatic)
  const [picked, setPicked] = useState<string[]>([]);
  const now = new Date();
  const [year, setYear] = useState(now.getMonth() >= 9 ? now.getFullYear() + 1 : now.getFullYear());
  const [startMonth, setStartMonth] = useState(0);
  const [monday, setMonday] = useState(true);
  const [withCover, setWithCover] = useState(true);
  const [title, setTitle] = useState('');
  const [order, setOrder] = useState<'old' | 'new'>('old');
  // test page
  const [measured, setMeasured] = useState('');
  const [scale, setScale] = useState(printScale());

  const auto = (n: number) => [...photos.filter((p) => p.favorite), ...photos.filter((p) => !p.favorite).sort((a, b) => b.createdAt - a.createdAt)].slice(0, n);
  const chosen = picked.length ? photos.filter((p) => picked.includes(p.id)) : null;
  const calendarPhotos = chosen ?? auto(withCover ? 13 : 12);
  const contactPhotos = [...(chosen ?? photos)].sort((a, b) => (order === 'old' ? a.createdAt - b.createdAt : b.createdAt - a.createdAt));

  const run = async (make: () => Promise<Blob>, name: string, done: string) => {
    setBusy(true);
    try {
      downloadBlob(await make(), name);
      notify(done);
    } catch (error) {
      console.error(error);
      notify('That could not be made. Try fewer photos or a smaller paper.', 'warning');
    } finally {
      setBusy(false);
    }
  };
  const go = () => {
    if (kind === 'card' && cardPhoto)
      return run(() => cardPdf(cardPhoto.blob, { size: cardSize, message, font, from }), 'delineate-card.pdf', 'Card ready — print double-sided, flipping on the short edge, at 100%.');
    if (kind === 'calendar')
      return run(() => calendarPdf(calendarPhotos, { year, startMonth, monday, paper, title, cover: withCover }), `delineate-calendar-${year}.pdf`, 'Calendar ready to print.');
    if (kind === 'contact') return run(() => contactSheetPdf(contactPhotos, { title, paper }), 'delineate-contact-sheet.pdf', 'Contact sheet ready to print.');
    return run(() => testPagePdf(paper), 'delineate-printer-test.pdf', 'Print it at 100% / actual size, then measure the 100 mm line.');
  };
  const mm = Number(measured);
  const validMm = mm >= 80 && mm <= 120;

  const paperSelect = (
    <label className="ps-field">
      <span>Paper</span>
      <select className="text-input" value={paperId} onChange={(e) => setPaperId(e.target.value)}>
        {SHEET_PAPERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
    </label>
  );
  const photoChoice = (max: number, autoNote: string) => (
    <div className="pj-photos">
      <span>{picked.length ? `${picked.length} chosen` : autoNote}</span>
      <button type="button" className="button button-outline" onClick={() => setPicking(true)}>
        <Images size={14} /> {picked.length ? 'Change' : 'Choose photos'}
      </button>
      {picked.length > 0 && (
        <button type="button" className="text-button" onClick={() => setPicked([])}>
          Use automatic
        </button>
      )}
      {picking && (
        <PhotoPicker
          photos={photos}
          title={`Choose up to ${max} photos`}
          selected={picked}
          onPick={(id) => setPicked((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length < max ? [...s, id] : s))}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );

  return (
    <Modal title={meta.label} eyebrow="Studio › Frames › Print" onClose={onClose}>
      <div className="pj">
        {kind === 'card' && (
          <>
            <div className="pj-card-photo">
              {cardPhoto ? <Thumb photo={cardPhoto} className="pj-thumb" /> : <span className="pj-thumb" />}
              <button type="button" className="button button-outline" onClick={() => setPicking(true)}>
                <Images size={14} /> {cardPhoto ? 'Change photo' : 'Choose a photo'}
              </button>
              {picking && (
                <PhotoPicker
                  photos={photos}
                  title="Photo for the front"
                  onPick={(id) => {
                    setCardPhoto(photos.find((p) => p.id === id) ?? null);
                    setPicking(false);
                  }}
                  onClose={() => setPicking(false)}
                />
              )}
            </div>
            <div className="segmented pj-seg" role="radiogroup" aria-label="Card size">
              {CARD_SIZES.map((c) => (
                <button key={c.id} type="button" role="radio" aria-checked={cardSize === c.id} className={cardSize === c.id ? 'is-active' : ''} onClick={() => setCardSize(c.id)}>
                  {c.label}
                </button>
              ))}
            </div>
            <textarea className="text-input pj-message" rows={4} maxLength={300} value={message} placeholder="Your message inside the card…" aria-label="Message" onChange={(e) => setMessage(e.target.value)} />
            <div className="segmented pj-seg" role="radiogroup" aria-label="Message style">
              {(['hand', 'serif'] as const).map((f) => (
                <button key={f} type="button" role="radio" aria-checked={font === f} className={`${font === f ? 'is-active' : ''} is-${f}`} onClick={() => setFont(f)}>
                  {f === 'hand' ? 'Handwritten' : 'Serif'}
                </button>
              ))}
            </div>
            <input className="text-input" value={from} maxLength={40} placeholder="From (optional), e.g. With love, Asha" aria-label="From" onChange={(e) => setFrom(e.target.value)} />
            <small className="pr-hint">Two pages: the outside (photo on the front) and the inside (your message). Print double-sided, flip on the short edge, at 100%.</small>
          </>
        )}

        {kind === 'calendar' && (
          <>
            <div className="pj-grid2">
              <label className="ps-field">
                <span>Year</span>
                <input className="text-input" type="number" inputMode="numeric" min={2000} max={2100} value={year} onChange={(e) => setYear(Math.min(2100, Math.max(2000, Number(e.target.value) || year)))} />
              </label>
              <label className="ps-field">
                <span>Starts in</span>
                <select className="text-input" value={startMonth} onChange={(e) => setStartMonth(Number(e.target.value))}>
                  {Array.from({ length: 12 }, (_, m) => (
                    <option key={m} value={m}>
                      {new Date(2024, m, 1).toLocaleDateString(undefined, { month: 'long' })}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="segmented pj-seg" role="radiogroup" aria-label="Week starts on">
              {[true, false].map((mon) => (
                <button key={String(mon)} type="button" role="radio" aria-checked={monday === mon} className={monday === mon ? 'is-active' : ''} onClick={() => setMonday(mon)}>
                  Week starts {mon ? 'Monday' : 'Sunday'}
                </button>
              ))}
            </div>
            {paperSelect}
            <Toggle checked={withCover} onChange={setWithCover} label="Cover page" />
            {withCover && <input className="text-input" value={title} maxLength={40} placeholder={`Cover title (default: ${year})`} aria-label="Cover title" onChange={(e) => setTitle(e.target.value)} />}
            {photoChoice(13, `Automatic: your favourites first, then the newest (${calendarPhotos.length})`)}
          </>
        )}

        {kind === 'contact' && (
          <>
            <input className="text-input" value={title} maxLength={40} placeholder="Title, e.g. Roll 03 · Goa" aria-label="Sheet title" onChange={(e) => setTitle(e.target.value)} />
            <div className="segmented pj-seg" role="radiogroup" aria-label="Order">
              {(['old', 'new'] as const).map((o) => (
                <button key={o} type="button" role="radio" aria-checked={order === o} className={order === o ? 'is-active' : ''} onClick={() => setOrder(o)}>
                  {o === 'old' ? 'Oldest first' : 'Newest first'}
                </button>
              ))}
            </div>
            {paperSelect}
            {photoChoice(70, `All ${photos.length} photos`)}
            <small className="pr-hint">35 frames to a sheet, numbered on film-strip rows.</small>
          </>
        )}

        {kind === 'test' && (
          <>
            <p className="modal-copy">Print the test page at 100% (“Actual size”, not “Fit to page”), measure the 100 mm line, and enter what you get. Prints and cards are then corrected for your printer.</p>
            {paperSelect}
            <div className="pj-measure">
              <label className="ps-field">
                <span>Measured length (mm)</span>
                <input className="text-input" type="number" inputMode="decimal" step={0.5} min={80} max={120} value={measured} placeholder="100" onChange={(e) => setMeasured(e.target.value)} />
              </label>
              <button
                type="button"
                className="button button-outline"
                disabled={!validMm}
                onClick={() => {
                  setPrintScale(mm);
                  setScale(printScale());
                  notify(`Saved: true-size prints will be scaled by ${((100 / mm - 1) * 100).toFixed(1)}%.`);
                }}
              >
                Save correction
              </button>
            </div>
            <small className="pr-hint">
              {scale === 1 ? 'No correction yet.' : `Current correction: ${((scale - 1) * 100).toFixed(1)}%. `}
              {scale !== 1 && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setPrintScale(null);
                    setScale(1);
                  }}
                >
                  Reset
                </button>
              )}
            </small>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="button button-outline" onClick={onClose}>
          Close
        </button>
        <button type="button" className="button button-dark" onClick={() => void go()} disabled={busy || (kind === 'card' && !cardPhoto) || ((kind === 'calendar' || kind === 'contact') && !photos.length)}>
          {busy ? <Spinner /> : <FileDown size={15} />} {busy ? 'Making…' : kind === 'test' ? 'Download test page' : 'Download PDF'}
        </button>
      </div>
    </Modal>
  );
}
