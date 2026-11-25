import { BookmarkPlus, Star, X } from 'lucide-react';
import { useState } from 'react';
import type { FrameStyle } from '../types';
import { CAPTION_FRAMES, CAPTION_LABEL, FRAME_GROUPS, FRAME_STYLES, PAPER_COLOURS, PAPER_FRAMES, type FrameGroup } from '../lib/frames';
import { Range } from './ui';

export type FrameValue = { border: FrameStyle; caption: string; scale: number; paper: string | null };
type Recipe = { id: string; name: string; border: FrameStyle; scale: number; paper: string | null };

// Favourites and recipes are small per-device lists; `delineate-` keys travel with the backup.
const FAVS = 'delineate-frame-favs';
const RECIPES = 'delineate-frame-recipes';
const load = <T,>(key: string, fallback: T): T => {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '') as T;
  } catch {
    return fallback;
  }
};
const store = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode: the list just won't stick */
  }
};

/** The frame chooser shared by Process, Studio › Frames and Studio › Art. */
export default function FramePicker({ value, onChange, title = 'Frame' }: { value: FrameValue; onChange: (patch: Partial<FrameValue>) => void; title?: string }) {
  const [group, setGroup] = useState<FrameGroup | 'all' | 'fav'>('all');
  const [favs, setFavs] = useState<FrameStyle[]>(() => load(FAVS, []));
  const [recipes, setRecipes] = useState<Recipe[]>(() => load(RECIPES, []));
  const [naming, setNaming] = useState<string | null>(null);

  const shown = FRAME_STYLES.filter((f) => (group === 'all' ? true : group === 'fav' ? favs.includes(f.id) : f.id === 'none' || f.group === group));
  const isFav = favs.includes(value.border);
  const toggleFav = () => {
    const next = isFav ? favs.filter((id) => id !== value.border) : [...favs, value.border];
    setFavs(next);
    store(FAVS, next);
  };
  const saveRecipe = () => {
    const name = (naming ?? '').trim().slice(0, 28);
    setNaming(null);
    if (!name) return;
    const next = [...recipes, { id: Date.now().toString(36), name, border: value.border, scale: value.scale, paper: value.paper }];
    setRecipes(next);
    store(RECIPES, next);
  };
  const dropRecipe = (id: string) => {
    const next = recipes.filter((r) => r.id !== id);
    setRecipes(next);
    store(RECIPES, next);
  };
  const framed = value.border !== 'none';

  return (
    <div className="fp">
      <span className="eyebrow">{title}</span>
      {recipes.length > 0 && (
        <div className="fp-recipes" aria-label="My frame recipes">
          {recipes.map((r) => (
            <span key={r.id} className="fp-recipe">
              <button type="button" onClick={() => onChange({ border: r.border, scale: r.scale, paper: r.paper })}>
                {r.name}
              </button>
              <button type="button" className="fp-recipe-x" onClick={() => dropRecipe(r.id)} aria-label={`Delete recipe ${r.name}`}>
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="fp-groups" role="tablist" aria-label="Frame families">
        {[{ id: 'all' as const, label: 'All' }, ...(favs.length ? [{ id: 'fav' as const, label: '★' }] : []), ...FRAME_GROUPS].map((g) => (
          <button key={g.id} type="button" role="tab" aria-selected={group === g.id} className={group === g.id ? 'is-active' : ''} onClick={() => setGroup(g.id)} aria-label={g.id === 'fav' ? 'Favourite frames' : undefined}>
            {g.label}
          </button>
        ))}
      </div>
      <div className="pr-frames">
        {shown.map((f) => (
          <button key={f.id} type="button" className={value.border === f.id ? 'is-active' : ''} onClick={() => onChange({ border: f.id })} title={f.label}>
            <span style={{ background: f.swatch }} />
            <small>
              {favs.includes(f.id) ? '★ ' : ''}
              {f.label}
            </small>
          </button>
        ))}
      </div>

      {CAPTION_FRAMES.includes(value.border) && (
        <input
          className="text-input pr-caption"
          value={value.caption}
          maxLength={48}
          placeholder={`${CAPTION_LABEL[value.border] ?? 'Caption'} on the frame (optional)…`}
          aria-label={`Frame ${(CAPTION_LABEL[value.border] ?? 'caption').toLowerCase()}`}
          onChange={(e) => onChange({ caption: e.target.value })}
        />
      )}

      {framed && (
        <>
          <Range label="Thickness" min={0.5} max={2} step={0.05} value={value.scale} display={`${Math.round(value.scale * 100)}%`} onChange={(v) => onChange({ scale: v })} />
          {PAPER_FRAMES.includes(value.border) && (
            <div className="fp-paper" role="radiogroup" aria-label="Paper colour">
              <span>Paper</span>
              <button type="button" role="radio" aria-checked={value.paper === null} className={`is-own ${value.paper === null ? 'is-active' : ''}`} onClick={() => onChange({ paper: null })} title="The frame's own paper">
                Own
              </button>
              {PAPER_COLOURS.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={value.paper === c} aria-label={`Paper ${c}`} className={value.paper === c ? 'is-active' : ''} style={{ background: c }} onClick={() => onChange({ paper: c })} />
              ))}
            </div>
          )}
          <div className="fp-actions">
            <button type="button" className={`text-button ${isFav ? 'is-on' : ''}`} onClick={toggleFav} aria-pressed={isFav}>
              <Star size={12} /> {isFav ? 'Favourite' : 'Add to favourites'}
            </button>
            {naming === null ? (
              <button type="button" className="text-button" onClick={() => setNaming('')}>
                <BookmarkPlus size={12} /> Save as recipe
              </button>
            ) : (
              <form
                className="fp-name"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveRecipe();
                }}
              >
                <input className="text-input" autoFocus value={naming} maxLength={28} placeholder="Recipe name" aria-label="Recipe name" onChange={(e) => setNaming(e.target.value)} onBlur={() => !naming.trim() && setNaming(null)} />
                <button type="submit" className="button button-dark" disabled={!naming.trim()}>
                  Save
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
