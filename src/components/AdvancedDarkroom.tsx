import { ArrowDown, ArrowUp, ClipboardCopy, ClipboardPaste, Columns2, Copy, Download, Eye, FolderOpen, Pencil, Redo2, RotateCcw, Save, Star, Trash2, Undo2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import type { PhotoRecord } from '../types';
import {
  ADV_DEFAULT, GROUPS, HSL_BANDS, STARTER_RECIPES, curveLut, exportRecipes, loadRecipes, normalizeAdv, parseRecipes, renderAdv, saveRecipes, summarize,
  type Adv, type CurvePt, type Recipe,
} from '../lib/darkroom';
import { canvasToBlob, downloadBlob, loadImage, uid } from '../lib/utils';
import { haptic, playSuccess } from '../lib/audio';
import { PhotoPicker, Range, useObjectUrl } from './ui';

type Props = {
  roll: PhotoRecord[];
  library: PhotoRecord[];
  onSave: (record: PhotoRecord) => Promise<void>;
  notify: (message: string, tone?: 'default' | 'warning') => void;
};
type Panel = 'light' | 'colour' | 'hsl' | 'curve' | 'effects' | 'recipes';
const PANELS: { id: Panel; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'colour', label: 'Colour' },
  { id: 'hsl', label: 'HSL' },
  { id: 'curve', label: 'Curves' },
  { id: 'effects', label: 'Effects' },
  { id: 'recipes', label: 'Recipes' },
];
const CLIP_KEY = 'delineate-adv-clip';
const HUE_TRACK = 'linear-gradient(90deg,#f33,#fa3,#ee3,#3c5,#3cc,#36e,#93e,#e3b,#f33)';
const signed = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}`;

/** Where the edit starts from: the untouched original if this photo was darkroom-edited before. */
const sourceOf = (p: PhotoRecord) => (p.darkroom && p.original ? p.original : p.blob);

export default function AdvancedDarkroom({ roll, library, onSave, notify }: Props) {
  const [sourceId, setSourceId] = useState<string | null>(roll[0]?.id ?? null);
  const all = useMemo(() => [...roll, ...library], [roll, library]);
  const record = all.find((p) => p.id === sourceId) ?? null;
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [hist, setHist] = useState<{ list: Adv[]; i: number }>({ list: [ADV_DEFAULT], i: 0 });
  const a = hist.list[hist.i];
  const lastPush = useRef({ t: 0, key: '' });
  const [panel, setPanel] = useState<Panel>('light');
  const [hslMode, setHslMode] = useState<'h' | 's' | 'l'>('s');
  const [curveCh, setCurveCh] = useState<'m' | 'r' | 'g' | 'b'>('m');
  const [split, setSplit] = useState<number | null>(null);
  const [holding, setHolding] = useState(false);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clip, setClip] = useState<Adv | null>(() => {
    try {
      const raw = window.localStorage.getItem(CLIP_KEY);
      return raw ? normalizeAdv(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteGroups, setPasteGroups] = useState<string[]>(GROUPS.map((g) => g.id));
  const [recipes, setRecipes] = useState<Recipe[]>(loadRecipes);
  const [preview, setPreview] = useState<{ recipe: Recipe; url: string } | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const originalUrl = useObjectUrl(record ? sourceOf(record) : null);

  // A different photo: load its original and its saved edit record (if any) as the first history step.
  useEffect(() => {
    if (!record) {
      setImg(null);
      return;
    }
    let live = true;
    setHist({ list: [normalizeAdv(record.darkroom)], i: 0 });
    void loadImage(sourceOf(record)).then((image) => live && setImg(image));
    return () => {
      live = false;
    };
    // only when the chosen photo changes, not when its record is re-saved
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceId]);

  useEffect(() => {
    if (sourceId && !all.some((p) => p.id === sourceId)) setSourceId(roll[0]?.id ?? null);
  }, [all, sourceId, roll]);

  // Live preview, one render per frame at most.
  useEffect(() => {
    if (!img) return;
    const raf = requestAnimationFrame(() => {
      const out = renderAdv(img, a, 1100);
      const c = canvasRef.current;
      if (!c) return;
      c.width = out.width;
      c.height = out.height;
      c.getContext('2d')!.drawImage(out, 0, 0);
    });
    return () => cancelAnimationFrame(raf);
  }, [img, a]);

  useEffect(() => saveRecipes(recipes), [recipes]);

  /** Change settings. Rapid changes to the same control fold into one undo step. */
  const update = useCallback((patch: Partial<Adv>, key = Object.keys(patch).join()) => {
    const now = performance.now();
    const merge = key === lastPush.current.key && now - lastPush.current.t < 700;
    lastPush.current = { t: now, key };
    setHist((h) => {
      const base = h.list.slice(0, h.i + 1);
      const next = { ...base[base.length - 1], ...patch };
      if (merge && base.length > 1) {
        base[base.length - 1] = next;
        return { list: base, i: base.length - 1 };
      }
      const list = [...base, next].slice(-80);
      return { list, i: list.length - 1 };
    });
  }, []);
  const undo = () => setHist((h) => ({ ...h, i: Math.max(0, h.i - 1) }));
  const redo = () => setHist((h) => ({ ...h, i: Math.min(h.list.length - 1, h.i + 1) }));
  const reset = () => update(ADV_DEFAULT, 'reset');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (['INPUT', 'TEXTAREA'].includes(t.tagName) || !(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const copy = () => {
    setClip(a);
    try {
      window.localStorage.setItem(CLIP_KEY, JSON.stringify(a));
    } catch {
      /* clipboard lasts this visit */
    }
    notify('Adjustments copied — open another photo and paste.');
  };
  const paste = () => {
    if (!clip) return;
    const patch: Partial<Adv> = {};
    for (const g of GROUPS) if (pasteGroups.includes(g.id)) for (const k of g.keys) (patch as Record<string, unknown>)[k] = clip[k];
    update(patch, 'paste');
    setPasteOpen(false);
    notify(`Pasted ${pasteGroups.length === GROUPS.length ? 'all adjustments' : GROUPS.filter((g) => pasteGroups.includes(g.id)).map((g) => g.label).join(', ')}.`);
  };

  const save = async (asCopy: boolean) => {
    if (!record || !img) return;
    setSaving(true);
    try {
      const canvas = renderAdv(img, a, 4096);
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.93);
      const original = record.original ?? record.blob;
      const edited: PhotoRecord = {
        ...record,
        blob,
        width: canvas.width,
        height: canvas.height,
        original,
        darkroom: a,
        process: undefined,
        developed: true,
        filterName: 'Advanced darkroom',
        note: `${record.note ? `${record.note} · ` : ''}Darkroom: ${summarize(a)}`.slice(0, 400),
      };
      if (asCopy) await onSave({ ...edited, id: uid(), createdAt: Date.now(), name: `${record.name} · print`, favorite: false });
      else await onSave(edited);
      playSuccess();
      haptic([20, 50, 20]);
      notify(asCopy ? 'Saved as a new print — the original stays untouched.' : record.developed === false ? 'Printed and moved to the archive. The negative is kept for re-editing.' : 'Saved. The original is kept, so you can re-edit any time.');
      if (record.developed === false && !asCopy) setSourceId(roll.find((p) => p.id !== record.id)?.id ?? null);
    } catch (error) {
      console.error(error);
      notify('That print could not be saved. Try again.', 'warning');
    } finally {
      setSaving(false);
    }
  };

  /* Recipes */
  const openRecipe = (recipe: Recipe) => {
    if (!img) return;
    const c = renderAdv(img, recipe.settings, 360);
    setPreview({ recipe, url: c.toDataURL('image/jpeg', 0.85) });
  };
  const addRecipe = () => {
    const name = newName.trim() || `Recipe ${recipes.length + 1}`;
    setRecipes((r) => [...r, { id: uid(), name, favorite: false, settings: a }]);
    setNewName('');
    notify(`Saved recipe “${name}”.`);
  };
  const move = (id: string, d: -1 | 1) =>
    setRecipes((list) => {
      const i = list.findIndex((r) => r.id === id);
      const j = i + d;
      if (i < 0 || j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const importFile = async (file: File) => {
    try {
      const items = parseRecipes(await file.text());
      if (!items.length) throw new Error('No recipes found in that file.');
      setRecipes((r) => [...r, ...items.map((it) => ({ id: uid(), name: it.name, favorite: false, settings: it.settings }))]);
      notify(`Imported ${items.length} recipe${items.length === 1 ? '' : 's'}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not read that file.', 'warning');
    }
  };
  const sortedRecipes = [...recipes.filter((r) => r.favorite), ...recipes.filter((r) => !r.favorite)];

  const dragSplit = (e: RPointerEvent<HTMLDivElement>) => {
    if (split === null || !(e.buttons & 1)) return;
    const box = stageRef.current?.querySelector('.adr-frame')?.getBoundingClientRect();
    if (box) setSplit(Math.min(1, Math.max(0, (e.clientX - box.left) / box.width)));
  };

  const R = (key: keyof Adv, label: string, min = -100, max = 100, step = 1, fmt: (v: number) => string = signed) => (
    <Range label={label} min={min} max={max} step={step} value={a[key] as number} display={fmt(a[key] as number)} onChange={(v) => update({ [key]: v } as Partial<Adv>)} />
  );

  return (
    <div className="adr">
      <div className="adr-sources">
        {roll.length > 0 && <span className="adr-sources-label">Roll</span>}
        <div className="adr-strip">
          {roll.map((p) => (
            <SourceThumb key={p.id} photo={p} active={p.id === sourceId} onClick={() => setSourceId(p.id)} />
          ))}
          {record && record.developed !== false && <SourceThumb photo={record} active onClick={() => undefined} />}
        </div>
        <button type="button" className="button button-outline" onClick={() => setPicker(true)} disabled={!library.length}>
          <FolderOpen size={14} /> <span className="adr-long">Open from </span>archive
        </button>
      </div>

      {!record ? (
        <div className="dv-pick-hint">
          <FolderOpen size={22} />
          <p>{roll.length ? 'Pick a negative from the roll' : 'Open a photo from the archive'} to start an advanced print. Edits are stored separately — the original is never changed.</p>
        </div>
      ) : (
        <div className="adr-layout">
          <section className="adr-stage" ref={stageRef}>
            <div className="adr-tools">
              <button type="button" className="round-icon" onClick={undo} disabled={hist.i === 0} aria-label="Undo" title="Undo (Ctrl+Z)"><Undo2 size={15} /></button>
              <button type="button" className="round-icon" onClick={redo} disabled={hist.i >= hist.list.length - 1} aria-label="Redo" title="Redo (Ctrl+Shift+Z)"><Redo2 size={15} /></button>
              <button type="button" className="round-icon" onClick={reset} aria-label="Reset all" title="Reset all"><RotateCcw size={15} /></button>
              <span className="adr-tools-gap" />
              <button type="button" className="round-icon" onClick={copy} aria-label="Copy adjustments" title="Copy adjustments"><ClipboardCopy size={15} /></button>
              <button type="button" className={`round-icon ${pasteOpen ? 'is-active' : ''}`} onClick={() => setPasteOpen((o) => !o)} disabled={!clip} aria-label="Paste adjustments" title="Paste selected adjustments"><ClipboardPaste size={15} /></button>
              <button type="button" className={`round-icon ${split !== null ? 'is-active' : ''}`} onClick={() => setSplit((s) => (s === null ? 0.5 : null))} aria-pressed={split !== null} aria-label="Before / after split" title="Before / after split"><Columns2 size={15} /></button>
              <button
                type="button"
                className={`button button-outline adr-hold ${holding ? 'is-active' : ''}`}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  setHolding(true);
                }}
                onPointerUp={() => setHolding(false)}
                onPointerCancel={() => setHolding(false)}
                onLostPointerCapture={() => setHolding(false)}
                onContextMenu={(e) => e.preventDefault()}
              >
                <Eye size={14} /> Hold: original
              </button>
            </div>
            {pasteOpen && clip && (
              <div className="adr-paste">
                <strong>Paste which adjustments?</strong>
                <div className="adr-chips">
                  {GROUPS.map((g) => (
                    <label key={g.id} className={`adr-chip ${pasteGroups.includes(g.id) ? 'is-on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={pasteGroups.includes(g.id)}
                        onChange={(e) => setPasteGroups((s) => (e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id)))}
                      />
                      {g.label}
                    </label>
                  ))}
                </div>
                <button type="button" className="button button-dark" onClick={paste} disabled={!pasteGroups.length}>Paste</button>
              </div>
            )}
            <div className="adr-view" onPointerMove={dragSplit} onPointerDown={dragSplit}>
              <div className="adr-frame">
                {originalUrl && <img className="adr-original" src={originalUrl} alt="Original" />}
                <canvas
                  ref={canvasRef}
                  className="adr-canvas"
                  style={{ opacity: holding ? 0 : 1, clipPath: split !== null ? `inset(0 0 0 ${split * 100}%)` : undefined }}
                />
                {split !== null && (
                  <span className="adr-divider" style={{ left: `${split * 100}%` }} aria-hidden="true">
                    <i />
                  </span>
                )}
                {split !== null && <span className="adr-tag is-before">Before</span>}
                {split !== null && <span className="adr-tag is-after">After</span>}
                {holding && <span className="adr-tag is-before">Original</span>}
                {!img && <span className="pr-loading">Loading…</span>}
              </div>
            </div>
            <div className="adr-foot">
              <span className="adr-summary" title={summarize(a)}>{record.name} · {summarize(a)}</span>
              <button type="button" className="button button-outline" onClick={() => void save(true)} disabled={saving || !img}>
                <Copy size={14} /> Save as copy
              </button>
              <button type="button" className="button button-dark" onClick={() => void save(false)} disabled={saving || !img}>
                <Save size={14} /> {record.developed === false ? 'Print to archive' : 'Save'}
              </button>
            </div>
          </section>

          <aside className="adr-panel">
            <div className="segmented adr-tabs" role="tablist">
              {PANELS.map((p) => (
                <button key={p.id} type="button" role="tab" aria-selected={panel === p.id} className={panel === p.id ? 'is-active' : ''} onClick={() => setPanel(p.id)}>
                  {p.label}
                </button>
              ))}
            </div>

            {panel === 'light' && (
              <div className="adr-group">
                {R('exposure', 'Exposure', -3, 3, 0.05, (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`)}
                {R('contrast', 'Contrast')}
                {R('highlights', 'Highlights')}
                {R('shadows', 'Shadows')}
                {R('whites', 'Whites')}
                {R('blacks', 'Blacks')}
              </div>
            )}

            {panel === 'colour' && (
              <div className="adr-group">
                {R('temp', 'Temperature')}
                {R('tint', 'Tint')}
                {R('vibrance', 'Vibrance')}
                {R('saturation', 'Saturation')}
                <label className="adr-check">
                  <input type="checkbox" checked={a.mono} onChange={(e) => update({ mono: e.target.checked })} /> Monochrome
                </label>
                <h4>Split toning</h4>
                <div className="adr-hue" style={{ ['--hue-track' as string]: HUE_TRACK }}>
                  {R('splitShadowHue', 'Shadow hue', 0, 360, 1, (v) => `${Math.round(v)}°`)}
                </div>
                {R('splitShadowAmt', 'Shadow amount', 0, 100, 1, (v) => `${Math.round(v)}`)}
                <div className="adr-hue" style={{ ['--hue-track' as string]: HUE_TRACK }}>
                  {R('splitHighHue', 'Highlight hue', 0, 360, 1, (v) => `${Math.round(v)}°`)}
                </div>
                {R('splitHighAmt', 'Highlight amount', 0, 100, 1, (v) => `${Math.round(v)}`)}
                {R('splitBalance', 'Balance')}
              </div>
            )}

            {panel === 'hsl' && (
              <div className="adr-group">
                <div className="segmented">
                  {(['h', 's', 'l'] as const).map((m) => (
                    <button key={m} type="button" className={hslMode === m ? 'is-active' : ''} onClick={() => setHslMode(m)}>
                      {m === 'h' ? 'Hue' : m === 's' ? 'Saturation' : 'Luminance'}
                    </button>
                  ))}
                </div>
                {HSL_BANDS.map((b, i) => {
                  const key = hslMode === 'h' ? 'hslH' : hslMode === 's' ? 'hslS' : 'hslL';
                  const arr = a[key];
                  return (
                    <div key={b.name} className="adr-band" style={{ ['--band' as string]: b.color }}>
                      <Range
                        label={b.name}
                        min={-100}
                        max={100}
                        value={arr[i]}
                        display={signed(arr[i])}
                        accent={b.color}
                        onChange={(v) => update({ [key]: arr.map((x, j) => (j === i ? v : x)) } as Partial<Adv>, `${key}${i}`)}
                      />
                    </div>
                  );
                })}
                <button type="button" className="button button-outline" onClick={() => update({ hslH: Array(8).fill(0), hslS: Array(8).fill(0), hslL: Array(8).fill(0) }, 'hsl-reset')}>
                  Reset HSL
                </button>
              </div>
            )}

            {panel === 'curve' && (
              <div className="adr-group">
                <div className="segmented">
                  {(['m', 'r', 'g', 'b'] as const).map((c) => (
                    <button key={c} type="button" className={curveCh === c ? 'is-active' : ''} onClick={() => setCurveCh(c)}>
                      {c === 'm' ? 'RGB' : c.toUpperCase()}
                    </button>
                  ))}
                </div>
                <CurveEditor
                  points={a.curve[curveCh]}
                  color={curveCh === 'm' ? 'var(--ink)' : curveCh === 'r' ? '#e5484d' : curveCh === 'g' ? '#3fa35f' : '#3f73d8'}
                  onChange={(pts) => update({ curve: { ...a.curve, [curveCh]: pts } }, `curve-${curveCh}`)}
                />
                <p className="adr-hint">Drag points. Tap the line to add one; double-tap a point to remove it.</p>
                <button type="button" className="button button-outline" onClick={() => update({ curve: ADV_DEFAULT.curve }, 'curve-reset')}>
                  Reset curves
                </button>
              </div>
            )}

            {panel === 'effects' && (
              <div className="adr-group">
                {R('fade', 'Fade', 0, 100, 1, (v) => `${Math.round(v)}`)}
                {R('vignette', 'Vignette', 0, 100, 1, (v) => `${Math.round(v)}`)}
                {R('grain', 'Grain', 0, 100, 1, (v) => `${Math.round(v)}`)}
                <div className="segmented">
                  {(['fine', 'medium', 'coarse'] as const).map((g) => (
                    <button key={g} type="button" className={a.grainSize === g ? 'is-active' : ''} onClick={() => update({ grainSize: g })}>
                      {g}
                    </button>
                  ))}
                </div>
                {R('sharpen', 'Sharpen', 0, 100, 1, (v) => `${Math.round(v)}`)}
                {R('bloom', 'Bloom', 0, 100, 1, (v) => `${Math.round(v)}`)}
                {R('halation', 'Halation', 0, 100, 1, (v) => `${Math.round(v)}`)}
                {R('leak', 'Light leak', 0, 100, 1, (v) => `${Math.round(v)}`)}
                {R('dust', 'Dust', 0, 100, 1, (v) => `${Math.round(v)}`)}
                {R('scratches', 'Scratches', 0, 100, 1, (v) => `${Math.round(v)}`)}
              </div>
            )}

            {panel === 'recipes' && (
              <div className="adr-group">
                {preview ? (
                  <div className="adr-recipe-preview">
                    <img src={preview.url} alt={`${preview.recipe.name} preview`} />
                    <strong>{preview.recipe.name}</strong>
                    <p>{summarize(preview.recipe.settings)}</p>
                    <div className="adr-row">
                      <button type="button" className="button button-outline" onClick={() => setPreview(null)}>Cancel</button>
                      <button
                        type="button"
                        className="button button-dark"
                        onClick={() => {
                          update(preview.recipe.settings, 'recipe');
                          notify(`Applied “${preview.recipe.name}”.`);
                          setPreview(null);
                        }}
                      >
                        Apply recipe
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="adr-row">
                      <input className="adr-input" value={newName} maxLength={60} placeholder="Name this look…" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addRecipe()} />
                      <button type="button" className="button button-dark" onClick={addRecipe}>Save recipe</button>
                    </div>
                    <ul className="adr-recipes">
                      {sortedRecipes.map((r) => (
                        <li key={r.id}>
                          <button type="button" className={`adr-star ${r.favorite ? 'is-on' : ''}`} onClick={() => setRecipes((l) => l.map((x) => (x.id === r.id ? { ...x, favorite: !x.favorite } : x)))} aria-label={r.favorite ? 'Unfavourite' : 'Favourite'}>
                            <Star size={14} />
                          </button>
                          {renaming === r.id ? (
                            <input
                              className="adr-input"
                              autoFocus
                              defaultValue={r.name}
                              maxLength={60}
                              onBlur={(e) => {
                                const name = e.target.value.trim();
                                if (name) setRecipes((l) => l.map((x) => (x.id === r.id ? { ...x, name } : x)));
                                setRenaming(null);
                              }}
                              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                            />
                          ) : (
                            <button type="button" className="adr-recipe-name" onClick={() => openRecipe(r)} title={summarize(r.settings)}>
                              <b>{r.name}</b>
                              <small>{summarize(r.settings)}</small>
                            </button>
                          )}
                          <span className="adr-recipe-acts">
                            <button type="button" onClick={() => setRenaming(r.id)} aria-label="Rename"><Pencil size={13} /></button>
                            <button type="button" onClick={() => setRecipes((l) => [...l, { ...r, id: uid(), name: `${r.name} copy`, starter: false }])} aria-label="Duplicate"><Copy size={13} /></button>
                            <button type="button" onClick={() => move(r.id, -1)} aria-label="Move up"><ArrowUp size={13} /></button>
                            <button type="button" onClick={() => move(r.id, 1)} aria-label="Move down"><ArrowDown size={13} /></button>
                            <button type="button" onClick={() => setRecipes((l) => l.filter((x) => x.id !== r.id))} aria-label="Delete"><Trash2 size={13} /></button>
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="adr-row">
                      <button type="button" className="button button-outline" onClick={() => downloadBlob(new Blob([exportRecipes(recipes)], { type: 'application/json' }), 'delineate-recipes.json')}>
                        <Download size={14} /> Export
                      </button>
                      <button type="button" className="button button-outline" onClick={() => fileRef.current?.click()}>
                        <Upload size={14} /> Import
                      </button>
                      <button
                        type="button"
                        className="button button-outline"
                        onClick={() => setRecipes((l) => [...l, ...STARTER_RECIPES.filter((s) => !l.some((x) => x.id === s.id))])}
                        disabled={STARTER_RECIPES.every((s) => recipes.some((x) => x.id === s.id))}
                      >
                        Restore starters
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        accept="application/json,.json"
                        hidden
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void importFile(f);
                          e.target.value = '';
                        }}
                      />
                    </div>
                    <p className="adr-hint">Recipe files are plain JSON: {'{ "format": "delineate-recipes", "version": 1, "recipes": [{ "name", "settings" }] }'}.</p>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      {picker && (
        <PhotoPicker
          photos={library}
          title="Open a photo in the darkroom"
          onPick={(id) => {
            setSourceId(id);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}

function SourceThumb({ photo, active, onClick }: { photo: PhotoRecord; active: boolean; onClick: () => void }) {
  const url = useObjectUrl(photo.blob);
  return (
    <button type="button" className={`adr-thumb ${active ? 'is-active' : ''} ${photo.developed === false ? 'is-neg' : ''}`} onClick={onClick} aria-label={`Edit ${photo.name}`} aria-pressed={active}>
      {url && <img src={url} alt="" />}
    </button>
  );
}

/** Tone curve: drag points, tap the line to add, double-tap a point to remove (end points stay). */
function CurveEditor({ points, color, onChange }: { points: CurvePt[]; color: string; onChange: (p: CurvePt[]) => void }) {
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const sorted = [...points].sort((p, q) => p[0] - q[0]);
  const lut = curveLut(sorted);
  const path = Array.from({ length: 65 }, (_, i) => `${i ? 'L' : 'M'}${(i / 64) * 100},${100 - lut[Math.round((i / 64) * 255)] * 100}`).join(' ');
  const at = (e: { clientX: number; clientY: number }): CurvePt => {
    const r = svg.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, 1 - (e.clientY - r.top) / r.height))];
  };
  const down = (e: RPointerEvent<SVGSVGElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    let i = sorted.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.06);
    if (i < 0) {
      if (sorted.length >= 12) return;
      const next = [...sorted, p].sort((x, y) => x[0] - y[0]);
      i = next.findIndex((q) => q === p);
      onChange(next);
    }
    drag.current = i;
  };
  const move = (e: RPointerEvent<SVGSVGElement>) => {
    const i = drag.current;
    if (i === null) return;
    const p = at(e);
    const next = sorted.map((q) => [...q] as CurvePt);
    const last = next.length - 1;
    // end points only move up and down; inner points stay between their neighbours
    const x = i === 0 ? 0 : i === last ? 1 : Math.min(next[i + 1][0] - 0.02, Math.max(next[i - 1][0] + 0.02, p[0]));
    next[i] = [x, p[1]];
    onChange(next);
  };
  const remove = (e: React.MouseEvent<SVGSVGElement>) => {
    const p = at(e);
    const i = sorted.findIndex((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.06);
    if (i > 0 && i < sorted.length - 1) onChange(sorted.filter((_, j) => j !== i));
  };
  return (
    <svg
      ref={svg}
      className="adr-curve"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={() => (drag.current = null)}
      onPointerCancel={() => (drag.current = null)}
      onDoubleClick={remove}
      role="img"
      aria-label="Tone curve editor"
    >
      {[25, 50, 75].map((g) => (
        <g key={g}>
          <line x1={g} y1={0} x2={g} y2={100} />
          <line x1={0} y1={g} x2={100} y2={g} />
        </g>
      ))}
      <line className="adr-curve-diag" x1={0} y1={100} x2={100} y2={0} />
      <path d={path} style={{ stroke: color }} />
      {sorted.map((p, i) => (
        <circle key={i} cx={p[0] * 100} cy={100 - p[1] * 100} r={2.6} style={{ stroke: color }} />
      ))}
    </svg>
  );
}
