import '@fontsource/great-vibes/400.css';
import { ArrowLeft, ArrowUpToLine, Check, Copy, FileDown, ImagePlus, Images, Minus, Plus, Redo2, RotateCcw, RotateCw, Save, Share2, Trash2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { PhotoRecord } from '../types';
import { BORDERS, CARD_SIZES, EMOJIS, FONTS, INKS, PAPERS, TEMPLATES, cardPdf, drawFace, renderFace, stickerAt, facePhoto, type Card, type CardAssets, type CardFace, type Sticker } from '../lib/cardRender';
import { DECOS, decoUrl } from '../lib/decos';
import { canShareImages, shareImage } from '../lib/share';
import { useHistory } from '../lib/useHistory';
import { canvasToBlob, downloadBlob, loadImage, uid } from '../lib/utils';
import { PhotoPicker, Range, Spinner, Thumb } from './ui';

type Props = {
  photos: PhotoRecord[];
  start: PhotoRecord | null;
  onClose: () => void;
  onSave: (record: PhotoRecord) => Promise<void>;
  notify: (message: string, tone?: 'default' | 'warning') => void;
};

const STICKER_DECOS = DECOS.filter((d) => ['Stickers', 'Doodles', 'Nature', 'Shapes'].includes(d.cat)).slice(0, 36);
const initial = (): Card => ({ template: 'split', size: 'a6', heading: '', message: '', signoff: '', font: 'serif', ink: null, paper: '#fbf8f1', border: 'none', borderInk: '#6f5a46', stickers: [], ...TEMPLATES[0].defaults, photoPan: { x: 0, y: 0, zoom: 1 } });

/** Studio › Frames › Greeting card: templates, borders, words, stickers, live preview, print-ready PDF. */
export default function CardStudio({ photos, start, onClose, onSave, notify }: Props) {
  const [card, setCard, history] = useHistory<Card>(initial);
  const [photo, setPhoto] = useState<PhotoRecord | null>(start ?? photos[0] ?? null);
  const [face, setFace] = useState<CardFace>('front');
  const [selected, setSelected] = useState<string | null>(null);
  const [assets, setAssets] = useState<CardAssets>({ photo: null, stickers: new Map() });
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState<'pdf' | 'save' | null>(null);
  const [fontsReady, setFontsReady] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // dragging either a sticker, or (on a face with the photo) the photo inside its slot
  const drag = useRef<{ kind: 'sticker'; id: string; dx: number; dy: number } | { kind: 'photo'; x: number; y: number; start: { x: number; y: number } } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tpl = TEMPLATES.find((t) => t.id === card.template)!;
  const set = (patch: Partial<Card>) => setCard((c) => ({ ...c, ...patch }));
  const sel = card.stickers.find((s) => s.id === selected) ?? null;

  // canvas text needs the fonts actually loaded, not just declared
  useEffect(() => {
    void Promise.all(['48px "Great Vibes"', '48px "Instrument Serif"', '48px "DM Mono"'].map((f) => document.fonts?.load(f))).finally(() => setFontsReady(true));
  }, []);
  useEffect(() => {
    if (!tpl.faces.includes(face)) setFace('front');
  }, [tpl, face]);
  useEffect(() => {
    let live = true;
    if (!photo) return setAssets((a) => ({ ...a, photo: null }));
    // a new photo starts centred (no undo step when it already is)
    setCard((c) => (c.photoPan.x || c.photoPan.y || c.photoPan.zoom !== 1 ? { ...c, photoPan: { x: 0, y: 0, zoom: 1 } } : c));
    loadImage(photo.blob).then((img) => live && setAssets((a) => ({ ...a, photo: img })));
    return () => {
      live = false;
    };
  }, [photo]);
  // sticker images (decorations and your own uploads), loaded once each
  const stickerKeys = useMemo(() => [...new Set(card.stickers.filter((s) => s.kind !== 'emoji').map((s) => s.value))].join('|'), [card.stickers]);
  useEffect(() => {
    let live = true;
    const want = stickerKeys ? stickerKeys.split('|') : [];
    void Promise.all(want.filter((k) => !assets.stickers.has(k)).map(async (k) => [k, await loadImage(k)] as const)).then((loaded) => {
      if (!live || !loaded.length) return;
      setAssets((a) => ({ ...a, stickers: new Map([...a.stickers, ...loaded]) }));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stickerKeys]);

  const s = CARD_SIZES[card.size];
  const aspect = s.h / s.w;
  useEffect(() => {
    const c = canvasRef.current;
    if (!c || !fontsReady) return;
    const W = 720;
    c.width = W;
    c.height = Math.round(W * aspect);
    const ctx = c.getContext('2d')!;
    drawFace(ctx, c.width, c.height, card, face, assets);
    if (sel && sel.face === face) {
      // selection ring round the sticker being moved
      ctx.save();
      ctx.strokeStyle = '#c65d36';
      ctx.setLineDash([8, 6]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sel.x * c.width, sel.y * c.height, sel.size * c.width * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }, [card, face, assets, aspect, sel, fontsReady]);

  const point = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
  };
  const down = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const p = point(e);
    const hit = stickerAt(card, face, p.x, p.y, aspect);
    setSelected(hit?.id ?? null);
    if (hit) drag.current = { kind: 'sticker', id: hit.id, dx: p.x - hit.x, dy: p.y - hit.y };
    else if (facePhoto(card, face) && photo) drag.current = { kind: 'photo', x: p.x, y: p.y, start: { x: card.photoPan.x, y: card.photoPan.y } };
    else return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic pointer */
    }
  };
  const move = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d) return;
    const p = point(e);
    const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
    if (d.kind === 'sticker') setCard((c) => ({ ...c, stickers: c.stickers.map((st) => (st.id === d.id ? { ...st, x: clamp(p.x - d.dx), y: clamp(p.y - d.dy) } : st)) }));
    // finger right shows more of the photo's left side (pan goes down); 2.5 = a comfortable speed
    else setCard((c) => ({ ...c, photoPan: { ...c.photoPan, x: clamp(d.start.x - (p.x - d.x) * 2.5, -1, 1), y: clamp(d.start.y - (p.y - d.y) * 2.5, -1, 1) } }));
  };
  const addSticker = (kind: Sticker['kind'], value: string) => {
    const st: Sticker = { id: uid(), face, kind, value, x: 0.5 + (Math.random() - 0.5) * 0.3, y: 0.5 + (Math.random() - 0.5) * 0.3, size: kind === 'emoji' ? 0.14 : 0.22, rot: 0 };
    setCard((c) => ({ ...c, stickers: [...c.stickers, st] }));
    setSelected(st.id);
  };
  const removeSticker = () => {
    setCard((c) => ({ ...c, stickers: c.stickers.filter((st) => st.id !== selected) }));
    setSelected(null);
  };
  const duplicateSticker = () => {
    if (!sel) return;
    const copy = { ...sel, id: uid(), x: Math.min(1, sel.x + 0.06), y: Math.min(1, sel.y + 0.06) };
    setCard((c) => ({ ...c, stickers: [...c.stickers, copy] }));
    setSelected(copy.id);
  };
  const frontSticker = () => setCard((c) => ({ ...c, stickers: [...c.stickers.filter((st) => st.id !== selected), ...c.stickers.filter((st) => st.id === selected)] }));
  const patchSticker = (patch: Partial<Sticker>) => setCard((c) => ({ ...c, stickers: c.stickers.map((st) => (st.id === selected ? { ...st, ...patch } : st)) }));
  const chooseTemplate = (id: Card['template']) => {
    const t = TEMPLATES.find((x) => x.id === id)!;
    // a new template brings its own words and look, but keeps your stickers on the faces it still has
    setCard((c) => ({ ...c, ...t.defaults, template: id, ink: null, stickers: c.stickers.filter((st) => t.faces.includes(st.face)) }));
    setFace('front');
    setSelected(null);
  };

  const pdf = async () => {
    setBusy('pdf');
    try {
      await document.fonts?.ready;
      downloadBlob(await cardPdf(card, assets), `delineate-card-${card.size}.pdf`);
      notify(card.template === 'fold' || card.template === 'postcard' ? 'Card ready. Print double-sided at 100% — flip on the short edge.' : 'Card ready. Print at 100% / actual size.');
    } catch (error) {
      console.error(error);
      notify('The card could not be made.', 'warning');
    } finally {
      setBusy(null);
    }
  };
  const frontImage = async () => canvasToBlob(renderFace(card, 'front', assets, 200), 'image/jpeg', 0.93);
  const save = async () => {
    setBusy('save');
    try {
      const blob = await frontImage();
      const c = renderFace(card, 'front', assets, 60);
      await onSave({ id: uid(), name: `Card · ${card.heading || tpl.label}`.slice(0, 60), createdAt: Date.now(), blob, mime: 'image/jpeg', width: c.width * (200 / 60), height: c.height * (200 / 60), filterName: `Card · ${tpl.label}`, kind: 'art', developed: true, note: `${CARD_SIZES[card.size].label} card made in the Studio` });
      notify('The front of your card is saved to the Archive.');
    } catch {
      notify('The card could not be saved.', 'warning');
    } finally {
      setBusy(null);
    }
  };

  const needsPhoto = card.template !== 'ornate';
  return (
    <div className="process-page fs-page cs-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Studio / 07 · Frames · Greeting card</span>
          <p>{tpl.label} · {CARD_SIZES[card.size].label}</p>
        </div>
        <div className="pr-top-actions fs-actions">
          <button type="button" className="button button-outline" onClick={onClose}>
            <ArrowLeft size={14} /> Back
          </button>
          <button type="button" className="button button-outline" onClick={() => void save()} disabled={busy !== null}>
            {busy === 'save' ? <Spinner /> : <Save size={14} />} Save front
          </button>
          {canShareImages() && (
            <button type="button" className="button button-outline" onClick={() => void frontImage().then((b) => shareImage(b, 'delineate-card.jpg', card.heading || 'A card for you')).catch(() => undefined)}>
              <Share2 size={14} /> Share
            </button>
          )}
          <button type="button" className="button button-dark" onClick={() => void pdf()} disabled={busy !== null}>
            {busy === 'pdf' ? <Spinner /> : <FileDown size={14} />} Print PDF
          </button>
        </div>
      </div>

      <div className="pr-layout fs-layout">
        <section className="pr-stage cs-stage">
          {tpl.faces.length > 1 && (
            <div className="segmented cs-faces" role="tablist" aria-label="Card side">
              {tpl.faces.map((f) => (
                <button key={f} type="button" role="tab" aria-selected={face === f} className={face === f ? 'is-active' : ''} onClick={() => setFace(f)}>
                  {f === 'front' ? 'Front' : f === 'inside' ? 'Inside' : 'Back'}
                </button>
              ))}
            </div>
          )}
          <div className="cs-canvas-wrap">
            <div className="cs-canvas-box">
            <canvas
              ref={canvasRef}
              className="cs-canvas"
              style={{ aspectRatio: `${s.w} / ${s.h}` }}
              onPointerDown={down}
              onPointerMove={move}
              onPointerUp={() => (drag.current = null)}
              onPointerCancel={() => (drag.current = null)}
            />
            {sel && sel.face === face && (
              <div
                className={`cs-sticker-menu ${sel.y < 0.22 ? 'is-below' : ''}`}
                role="toolbar"
                aria-label="Sticker"
                // just above (or below) the sticker's edge: its radius is 0.62 × size of the card's width
                style={{ left: `clamp(min(124px, 50%), ${sel.x * 100}%, max(calc(100% - 124px), 50%))`, top: `${(sel.y + (sel.y < 0.22 ? 1 : -1) * ((sel.size * 0.62) / aspect)) * 100}%` }}
              >
                <button type="button" onClick={() => patchSticker({ size: Math.max(0.05, +(sel.size / 1.15).toFixed(3)) })} aria-label="Smaller" title="Smaller">
                  <Minus size={15} />
                </button>
                <button type="button" onClick={() => patchSticker({ size: Math.min(0.7, +(sel.size * 1.15).toFixed(3)) })} aria-label="Bigger" title="Bigger">
                  <Plus size={15} />
                </button>
                <button type="button" onClick={() => patchSticker({ rot: sel.rot - 15 })} aria-label="Turn left" title="Turn left">
                  <RotateCcw size={15} />
                </button>
                <button type="button" onClick={() => patchSticker({ rot: sel.rot + 15 })} aria-label="Turn right" title="Turn right">
                  <RotateCw size={15} />
                </button>
                <button type="button" onClick={duplicateSticker} aria-label="Duplicate" title="Duplicate">
                  <Copy size={15} />
                </button>
                <button type="button" onClick={frontSticker} aria-label="Bring to front" title="Bring to front">
                  <ArrowUpToLine size={15} />
                </button>
                <button type="button" className="is-danger" onClick={removeSticker} aria-label="Delete sticker" title="Delete">
                  <Trash2 size={15} />
                </button>
                <button type="button" onClick={() => setSelected(null)} aria-label="Done" title="Done">
                  <Check size={15} />
                </button>
              </div>
            )}
            </div>
          </div>
          <div className="pr-stage-foot">
            <span className="pr-undo">
              <button type="button" className="round-icon" onClick={history.undo} disabled={!history.canUndo} aria-label="Undo">
                <Undo2 size={15} />
              </button>
              <button type="button" className="round-icon" onClick={history.redo} disabled={!history.canRedo} aria-label="Redo">
                <Redo2 size={15} />
              </button>
            </span>
            <span className="pr-name">{sel ? 'Drag to move · use the menu to resize, turn or delete' : facePhoto(card, face) && photo ? 'Drag the photo to position it · tap a sticker to edit it' : 'Tap a sticker to edit it'}</span>
          </div>
        </section>

        <aside className="pr-controls fs-controls cs-controls">
          <div className="pr-group">
            <span className="eyebrow">Template</span>
            <div className="cs-templates">
              {TEMPLATES.map((t) => (
                <button key={t.id} type="button" className={`cs-tpl is-${t.id} ${card.template === t.id ? 'is-active' : ''}`} onClick={() => chooseTemplate(t.id)}>
                  <i aria-hidden="true" />
                  <b>{t.label}</b>
                  <small>{t.note}</small>
                </button>
              ))}
            </div>

            <span className="eyebrow">Size</span>
            <div className="segmented cs-seg" role="radiogroup" aria-label="Card size">
              {(['a5', 'a6'] as const).map((z) => (
                <button key={z} type="button" role="radio" aria-checked={card.size === z} className={card.size === z ? 'is-active' : ''} onClick={() => set({ size: z })}>
                  {CARD_SIZES[z].label}
                </button>
              ))}
            </div>

            {needsPhoto && (
              <div className="cs-photo">
                {photo ? <Thumb photo={photo} className="pj-thumb" /> : <span className="pj-thumb" />}
                <button type="button" className="button button-outline" onClick={() => setPicking(true)} disabled={!photos.length}>
                  <Images size={14} /> {photo ? 'Change photo' : 'Choose photo'}
                </button>
              </div>
            )}
            {needsPhoto && photo && (
              <div className="cs-pan">
                <Range label="Photo zoom" min={1} max={3} step={0.01} value={card.photoPan.zoom} display={`${card.photoPan.zoom.toFixed(2)}×`} onChange={(v) => set({ photoPan: { ...card.photoPan, zoom: v } })} />
                <small className="pr-hint">Drag the photo on the card to choose what shows.</small>
                {(card.photoPan.x !== 0 || card.photoPan.y !== 0 || card.photoPan.zoom !== 1) && (
                  <button type="button" className="text-button" onClick={() => set({ photoPan: { x: 0, y: 0, zoom: 1 } })}>
                    Reset photo position
                  </button>
                )}
              </div>
            )}

            <span className="eyebrow">{card.template === 'postcard' ? 'Place and message' : 'Words'}</span>
            <input className="text-input" value={card.heading} maxLength={60} placeholder={card.template === 'postcard' ? 'Place, e.g. Florence' : 'Heading'} aria-label="Heading" onChange={(e) => set({ heading: e.target.value })} />
            <textarea className="text-input cs-message" rows={3} maxLength={400} value={card.message} placeholder="Your message" aria-label="Message" onChange={(e) => set({ message: e.target.value })} />
            <input className="text-input" value={card.signoff} maxLength={50} placeholder="Sign-off, e.g. With love ♡" aria-label="Sign-off" onChange={(e) => set({ signoff: e.target.value })} />
            <div className="segmented cs-seg cs-fonts" role="radiogroup" aria-label="Heading font">
              {FONTS.map((f) => (
                <button key={f.id} type="button" role="radio" aria-checked={card.font === f.id} className={card.font === f.id ? 'is-active' : ''} style={{ fontFamily: f.css }} onClick={() => set({ font: f.id })}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="cs-swatches" role="radiogroup" aria-label="Text colour">
              <span>Ink</span>
              <button type="button" role="radio" aria-checked={card.ink === null} className={`is-auto ${card.ink === null ? 'is-active' : ''}`} onClick={() => set({ ink: null })}>
                Auto
              </button>
              {INKS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={card.ink === c} aria-label={`Ink ${c}`} className={card.ink === c ? 'is-active' : ''} style={{ background: c }} onClick={() => set({ ink: c })} />
              ))}
            </div>
            <div className="cs-swatches" role="radiogroup" aria-label="Paper colour">
              <span>Paper</span>
              {PAPERS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={card.paper === c} aria-label={`Paper ${c}`} className={card.paper === c ? 'is-active' : ''} style={{ background: c }} onClick={() => set({ paper: c })} />
              ))}
            </div>

            <span className="eyebrow">Border</span>
            <div className="cs-borders">
              {BORDERS.map((b) => (
                <button key={b.id} type="button" className={`cs-border is-${b.id} ${card.border === b.id ? 'is-active' : ''}`} onClick={() => set({ border: b.id })}>
                  <i aria-hidden="true" />
                  {b.label}
                </button>
              ))}
            </div>
            {['line', 'double', 'doodle', 'deco', 'scallop', 'stamp'].includes(card.border) || card.template === 'ornate' ? (
              <div className="cs-swatches" role="radiogroup" aria-label="Border colour">
                <span>Border ink</span>
                {['#6f5a46', '#3a2f2a', '#9a7a3a', '#8a4b4b', '#4e6447', '#2c3e66', '#c65d36'].map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={card.borderInk === c} aria-label={`Border ${c}`} className={card.borderInk === c ? 'is-active' : ''} style={{ background: c }} onClick={() => set({ borderInk: c })} />
                ))}
              </div>
            ) : null}

            <span className="eyebrow">Stickers · on the {face === 'front' ? 'front' : face === 'inside' ? 'inside' : 'back'}</span>
            <div className="cs-emojis">
              {EMOJIS.map((e) => (
                <button key={e} type="button" onClick={() => addSticker('emoji', e)} aria-label={`Add ${e}`}>
                  {e}
                </button>
              ))}
            </div>
            <div className="cs-decos">
              {STICKER_DECOS.map((d) => {
                const url = decoUrl(d.id, d.color);
                return (
                  <button key={d.id} type="button" onClick={() => addSticker('deco', url)} aria-label={`Add ${d.name}`} title={d.name}>
                    <img src={url} alt="" />
                  </button>
                );
              })}
            </div>
            <button type="button" className="button button-outline cs-upload" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={14} /> Your own sticker (PNG works best)
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 8 * 1024 * 1024) return notify('That image is too large for a sticker (8 MB max).', 'warning');
                const reader = new FileReader();
                reader.onload = () => addSticker('image', String(reader.result));
                reader.readAsDataURL(f);
              }}
            />
          </div>
        </aside>
      </div>
      {picking && (
        <PhotoPicker
          photos={photos}
          title="Photo for the card"
          onPick={(id) => {
            setPhoto(photos.find((p) => p.id === id) ?? null);
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
