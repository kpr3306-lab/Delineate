import { CalendarDays, FileDown, Images, LayoutGrid, Mail, Ruler } from 'lucide-react';
import { useState } from 'react';
import type { PhotoRecord } from '../types';
import { PAPERS } from '../lib/print';
import { contactSheetPdf, printScale, setPrintScale, testPagePdf } from '../lib/printProjects';
import { downloadBlob } from '../lib/utils';
import { Modal, PhotoPicker, Spinner } from './ui';

export type ProjectKind = 'card' | 'calendar' | 'contact' | 'test';
export const PROJECTS: { id: ProjectKind; label: string; note: string; icon: typeof Mail }[] = [
  { id: 'card', label: 'Greeting card', note: 'Templates, borders, stickers · A5 or A6', icon: Mail },
  { id: 'calendar', label: 'Photo calendar', note: 'Layouts, date styles, a photo per month', icon: CalendarDays },
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
  // contact sheet: chosen photos (empty = all)
  const [picked, setPicked] = useState<string[]>([]);
  const [title, setTitle] = useState('');
  const [order, setOrder] = useState<'old' | 'new'>('old');
  // test page
  const [across, setAcross] = useState('');
  const [down, setDown] = useState('');
  const [scale, setScale] = useState(printScale());

  const chosen = picked.length ? photos.filter((p) => picked.includes(p.id)) : null;
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
    if (kind === 'contact') return run(() => contactSheetPdf(contactPhotos, { title, paper }), 'delineate-contact-sheet.pdf', 'Contact sheet ready to print.');
    return run(() => testPagePdf(paper), 'delineate-printer-test.pdf', 'Print it at 100% / actual size, then measure the 100 mm line.');
  };
  const a = Number(across);
  const b = Number(down);
  const validA = a >= 80 && a <= 120;
  const validB = b >= 80 && b <= 120;

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
            <p className="modal-copy">
              Home printers often print a little smaller or larger than true size, so a “4 × 6” print comes out 3.9 × 5.9. This page measures your printer once; after that,
              print sheets and cards are scaled to cancel the difference.
            </p>
            <details className="pj-how">
              <summary>How it works</summary>
              <p>
                The lines on the test page are drawn exactly 100 mm long. Your printer may print them a little shorter or longer — usually because of “Fit to page”, because it
                can't print to the paper's edge and shrinks the page to fit, or because the rollers stretch the paper slightly as it feeds.
              </p>
              <p>
                <b>A and B are what the lines actually measure on your paper.</b> They are measured separately because printers often differ across the page (the print head) and down it
                (the paper feed).
              </p>
              <p>
                The app then works out <b>100 ÷ your measurement</b> for each direction and draws every print that much larger or smaller, so your printer's shrink brings it back to the
                exact size. For example, if A measures 98 mm, prints are drawn 2% wider — and come out true.
              </p>
              <p>Do it once per printer; the correction is kept on this device (and in backups). Always print at 100% afterwards — “Fit to page” changes the shrink again.</p>
            </details>
            <ol className="pj-steps">
              <li>
                <b>Download and print the test page</b> at 100% — “Actual size”, not “Fit to page”.
                {paperSelect}
                <button type="button" className="button button-outline" onClick={() => void go()} disabled={busy}>
                  {busy ? <Spinner /> : <FileDown size={14} />} Download test page
                </button>
              </li>
              <li>
                <b>Measure lines A and B</b> with a ruler, from 0 to 10. On a true printer each is exactly 100 mm.
              </li>
              <li>
                <b>Enter what you measured</b> and save.
                <div className="pj-measure">
                  {(
                    [
                      ['A · across (mm)', across, setAcross],
                      ['B · down (mm)', down, setDown],
                    ] as const
                  ).map(([label, value, set]) => (
                    <label key={label} className="ps-field">
                      <span>{label}</span>
                      <input className="text-input" type="number" inputMode="decimal" step={0.5} min={80} max={120} value={value} placeholder="100" onChange={(e) => set(e.target.value)} />
                    </label>
                  ))}
                </div>
                {validA && (
                  <p className="pj-preview">
                    {[
                      ['Across', a],
                      ['Down', down === '' ? a : b],
                    ]
                      .map(([name, mm]) => {
                        const pct = (100 / Number(mm) - 1) * 100;
                        return Math.abs(pct) < 0.05 ? `${name}: already true` : `${name}: prints drawn ${Math.abs(pct).toFixed(1)}% ${pct > 0 ? 'larger' : 'smaller'}`;
                      })
                      .join(' · ')}
                  </p>
                )}
                <button
                  type="button"
                  className="button button-dark"
                  disabled={!validA || (down !== '' && !validB)}
                  onClick={() => {
                    setPrintScale(a, down === '' ? a : b);
                    setScale(printScale());
                    notify('Saved — print sheets and cards will now come out true to size on this printer.');
                  }}
                >
                  Save correction
                </button>
              </li>
            </ol>
            <p className="pj-status">
              {scale.x === 1 && scale.y === 1
                ? 'No correction saved — prints use their exact sizes.'
                : `Correction in use: ${scale.x >= 1 ? '+' : ''}${((scale.x - 1) * 100).toFixed(1)}% across, ${scale.y >= 1 ? '+' : ''}${((scale.y - 1) * 100).toFixed(1)}% down. `}
              {(scale.x !== 1 || scale.y !== 1) && (
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setPrintScale(null);
                    setScale(printScale());
                  }}
                >
                  Remove correction
                </button>
              )}
            </p>
          </>
        )}
      </div>
      <div className="modal-actions">
        <button type="button" className="button button-outline" onClick={onClose}>
          Close
        </button>
        {kind !== 'test' && (
          <button type="button" className="button button-dark" onClick={() => void go()} disabled={busy || !photos.length}>
            {busy ? <Spinner /> : <FileDown size={15} />} {busy ? 'Making…' : 'Download PDF'}
          </button>
        )}
      </div>
    </Modal>
  );
}
