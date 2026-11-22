import { BookmarkPlus, CameraOff, Check, Copy, Crop, Download, Eraser, Eye, FlipHorizontal2, ImagePlus, Layers, RotateCcw, RotateCcwSquare, RotateCwSquare, Save, SlidersHorizontal, Star, Trash2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { CropAspect, Effects, EditTarget, GrainSize, Look, PhotoRecord, ProcessConfig, StampStyle, UserPreset } from '../types';
import { CAPTION_FRAMES, FRAME_STYLES } from '../lib/frames';
import { BASE_LOOK } from '../lib/filters';
import { BASE_EFFECTS, PRESETS, PRESET_GROUPS, STAMP_STYLES, configForPreset, cropFit, cropFromBox, cropView, getPreset, processedAspect, renderProcessed } from '../lib/process';
import { FX_GROUPS } from '../lib/fx';
import { deletePreset, getAllPresets, savePreset } from '../lib/db';
import { canvasToBlob, clamp, downloadBlob, fileSlug, loadImage, uid } from '../lib/utils';
import { haptic, playPop, playSuccess } from '../lib/audio';
import { EmptyState, PhotoPicker, Range, Thumb, Toggle, useObjectUrl } from './ui';

type ProcessViewProps = {
  photos: PhotoRecord[];
  target: EditTarget | null;
  onTarget: (target: EditTarget | null) => void;
  onSave: (record: PhotoRecord) => Promise<void>;
  onImport: () => void;
  notify: (message: string, tone?: 'default' | 'warning') => void;
};

const ADJUST: { key: keyof Look; label: string; min: number; max: number; step: number; fmt?: (v: number) => string }[] = [
  { key: 'brightness', label: 'Exposure', min: 0.5, max: 1.6, step: 0.01, fmt: (v) => `${v >= 1 ? '+' : ''}${((v - 1) * 100).toFixed(0)}` },
  { key: 'contrast', label: 'Contrast', min: 0.5, max: 1.6, step: 0.01, fmt: (v) => `${((v - 1) * 100).toFixed(0)}` },
  { key: 'highlights', label: 'Highlights', min: -100, max: 100, step: 1, fmt: signed },
  { key: 'shadows', label: 'Shadows', min: -100, max: 100, step: 1, fmt: signed },
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, fmt: (v) => `${((v - 1) * 100).toFixed(0)}` },
  { key: 'warmth', label: 'Warmth', min: -60, max: 60, step: 1 },
  { key: 'tint', label: 'Tint', min: -40, max: 40, step: 1 },
  { key: 'fade', label: 'Fade', min: 0, max: 0.6, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
  { key: 'split', label: 'Split tone', min: 0, max: 0.6, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
  { key: 'grain', label: 'Grain', min: 0, max: 80, step: 1 },
  { key: 'lightLeak', label: 'Light leak', min: 0, max: 0.8, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
  { key: 'sharpen', label: 'Sharpen', min: 0, max: 100, step: 1 },
  { key: 'blur', label: 'Soft focus', min: 0, max: 3, step: 0.1 },
];

function signed(v: number) {
  return `${v > 0 ? '+' : ''}${v}`;
}

const ASPECTS: { id: CropAspect; label: string }[] = [
  { id: 'original', label: 'Original' },
  { id: '1:1', label: 'Square' },
  { id: '4:5', label: 'Portrait' },
  { id: '4:3', label: '4:3' },
  { id: '16:9', label: '16:9' },
  { id: '2.39', label: 'Letterbox' },
  { id: 'free', label: 'Free' },
];
const GRAIN_SIZES: GrainSize[] = ['fine', 'medium', 'coarse'];
const MINE = 'Mine';
const MINE_PREFIX = 'mine:';
/** Effects that belong to one photo (crop, extra frames), never to a preset. */
const PHOTO_KEYS = ['doubleId', 'doubleMix', 'booth', 'boothIds', 'rotate', 'flip', 'straighten', 'zoom', 'cropX', 'cropY', 'cropRatio', 'stampDate', 'caption'] as const;
const STAMP_SAMPLE: Record<StampStyle, string> = {
  none: '—', date: "'26 11 18", led: "11 18 '26", lcd: '2026.11.18', dymo: '18 NOV', ink: 'Nov 18', editorial: 'NOV 18', camcorder: 'PLAY ▶', rec: 'REC',
};
const STAMP_COLORS = ['#ff9a3c', '#ff3b2f', '#ffd23a', '#ffffff', '#1b1b1b', '#7fd1ff', '#ff6fb5', '#9be37a'];
const CORNER_LABEL = { tl: 'Top left', tr: 'Top right', bl: 'Bottom left', br: 'Bottom right' } as const;
/** <input type="date"> speaks local YYYY-MM-DD; keep the original time of day when the date changes. */
const toDateInput = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fromDateInput = (v: string, keepTime: number) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const t = new Date(keepTime);
  return new Date(+m[1], +m[2] - 1, +m[3], t.getHours(), t.getMinutes(), t.getSeconds()).getTime();
};
const withYear = (t: number, year: number) => {
  const d = new Date(t);
  d.setFullYear(year);
  return d.getTime();
};
const CROP_RESET = { rotate: 0, flip: false, straighten: 0, zoom: 1, cropX: 0, cropY: 0 } satisfies Partial<Effects>;
const PREVIEW_SIDE = 900;

const pickPhotoKeys = (e: Effects) =>
  Object.fromEntries(PHOTO_KEYS.map((k) => [k, e[k]])) as Pick<Effects, (typeof PHOTO_KEYS)[number]>;
const mineSwatch = (p: UserPreset) =>
  `linear-gradient(135deg, ${p.look.highlightTint ?? '#efe3cf'}, ${p.look.tone ?? (p.look.warmth >= 0 ? '#d9a383' : '#7fa8c9')}, ${p.look.shadowTint ?? '#4f4a42'})`;
const groupOf = (presetId: string) => (presetId.startsWith(MINE_PREFIX) ? MINE : getPreset(presetId).group);

export default function ProcessView({ photos, target, onTarget, onSave, onImport, notify }: ProcessViewProps) {
  const [cfg, setCfg] = useState(() => target?.record?.process ?? configForPreset('none'));
  const [group, setGroup] = useState(() => groupOf(cfg.presetId));
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [double, setDouble] = useState<HTMLImageElement | null>(null);
  const [booth, setBooth] = useState<HTMLImageElement[]>([]);
  const [picker, setPicker] = useState<null | 'source' | 'double' | 'booth'>(null);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'adjust' | 'effects' | 'crop'>('effects');
  const [mine, setMine] = useState<UserPreset[]>([]);
  const [draftName, setDraftName] = useState<string | null>(null);
  const [armed, setArmed] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pan = useRef<{ x: number; y: number; cx: number; cy: number; sx: number; sy: number } | null>(null);

  // Camera captures keep a clean copy without the body's look; "Strip cam effects" edits from that instead.
  const [stripCam, setStripCam] = useState(false);
  const camRaw = target?.record?.camRaw;
  const sourceBlob = target ? (stripCam && camRaw ? camRaw : (target.record?.original ?? target.blob)) : null;
  const sourceUrl = useObjectUrl(sourceBlob);
  const date = target?.record?.createdAt ?? Date.now();
  const e = cfg.effects;

  // New target → restore its saved configuration (re-editable from the archive).
  useEffect(() => {
    const restored = target?.record?.process ?? configForPreset('none');
    setCfg({ ...restored, effects: { ...BASE_EFFECTS, ...restored.effects } }); // older saves lack newer effects
    setGroup(groupOf(restored.presetId));
    setStripCam(Boolean(target?.record?.camStripped && target.record.camRaw));
  }, [target]);

  useEffect(() => {
    getAllPresets().then(setMine, (error) => console.error(error));
  }, []);

  // a delete button stays armed for a few seconds after the first tap
  useEffect(() => {
    if (!armed) return;
    const t = window.setTimeout(() => setArmed(null), 3000);
    return () => window.clearTimeout(t);
  }, [armed]);

  useEffect(() => {
    if (!sourceBlob) return setImage(null);
    let live = true;
    loadImage(sourceBlob).then((img) => live && setImage(img), () => notify('That image could not be opened.', 'warning'));
    return () => {
      live = false;
    };
  }, [sourceBlob, notify]);

  const byId = useMemo(() => new Map(photos.map((p) => [p.id, p])), [photos]);
  useEffect(() => {
    const rec = e.doubleId ? byId.get(e.doubleId) : null;
    if (!rec) return setDouble(null);
    let live = true;
    void loadImage(rec.blob).then((img) => live && setDouble(img));
    return () => {
      live = false;
    };
  }, [e.doubleId, byId]);
  useEffect(() => {
    let live = true;
    const recs = e.boothIds.map((id) => byId.get(id)).filter(Boolean) as PhotoRecord[];
    void Promise.all(recs.map((r) => loadImage(r.blob))).then((imgs) => live && setBooth(imgs));
    return () => {
      live = false;
    };
  }, [e.boothIds, byId]);

  // Live preview, debounced so dragging sliders stays smooth.
  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const t = window.setTimeout(() => {
      // while cropping, show the photo without its border so the crop grid sits on the photo itself
      const bare = panel === 'crop' && !cfg.effects.booth ? { ...cfg, effects: { ...cfg.effects, border: 'none' as const } } : cfg;
      const out = renderProcessed(image, bare, { longSide: PREVIEW_SIDE, date, double, booth });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = out.width;
      canvas.height = out.height;
      canvas.getContext('2d')!.drawImage(out, 0, 0);
    }, 50);
    return () => window.clearTimeout(t);
  }, [image, cfg, date, double, booth, panel]);

  const presetName = (id: string) =>
    id.startsWith(MINE_PREFIX) ? (mine.find((p) => MINE_PREFIX + p.id === id)?.name ?? 'My preset') : getPreset(id).name;

  // keep the photo's own composition (crop, booth, double; border/aspect unless the preset sets them)
  const applyPreset = (presetId: string, look: Look, effects: Partial<Effects> = {}) => {
    setCfg({
      presetId,
      look: { ...BASE_LOOK, ...look },
      effects: {
        ...BASE_EFFECTS,
        ...effects,
        ...pickPhotoKeys(e),
        border: effects.border ?? e.border,
        aspect: effects.aspect ?? e.aspect,
      },
    });
    playPop();
    haptic(8);
  };
  const choosePreset = (id: string) => {
    const preset = getPreset(id);
    applyPreset(preset.id, preset.look, preset.effects);
  };

  const saveMine = async () => {
    const effects: Partial<Effects> = { ...e };
    for (const k of PHOTO_KEYS) delete effects[k];
    const preset: UserPreset = {
      id: uid(),
      name: (draftName ?? '').trim().slice(0, 32) || `My preset ${mine.length + 1}`,
      createdAt: Date.now(),
      favorite: false,
      look: { ...cfg.look },
      effects,
    };
    try {
      await savePreset(preset);
      setMine((m) => [preset, ...m]);
      setCfg((c) => ({ ...c, presetId: MINE_PREFIX + preset.id }));
      setDraftName(null);
      playSuccess();
      notify(`Saved “${preset.name}” to your presets.`);
    } catch (error) {
      console.error(error);
      notify('Could not save this preset.', 'warning');
    }
  };
  const toggleFavorite = (preset: UserPreset) => {
    const next = { ...preset, favorite: !preset.favorite };
    setMine((m) => m.map((p) => (p.id === preset.id ? next : p)));
    savePreset(next).catch(() => notify('Could not update this preset.', 'warning'));
    haptic(6);
  };
  const removeMine = (preset: UserPreset) => {
    if (armed !== preset.id) return setArmed(preset.id);
    setArmed(null);
    deletePreset(preset.id).then(
      () => {
        setMine((m) => m.filter((p) => p.id !== preset.id));
        notify(`Deleted “${preset.name}”.`);
      },
      () => notify('Could not delete this preset.', 'warning'),
    );
  };
  const mineSorted = useMemo(
    () => [...mine].sort((a, b) => Number(b.favorite) - Number(a.favorite) || b.createdAt - a.createdAt),
    [mine],
  );

  // Crop tab: drag the preview to slide the photo inside the frame.
  const cropping = panel === 'crop' && Boolean(image) && !e.booth;
  const startPan = (ev: ReactPointerEvent<HTMLElement>) => {
    const canvas = canvasRef.current;
    if (!cropping || !image || !canvas || !canvas.width) return;
    const aspect = processedAspect(image, e);
    const w = aspect >= 1 ? PREVIEW_SIDE : Math.round(PREVIEW_SIDE * aspect);
    const h = aspect >= 1 ? Math.round(PREVIEW_SIDE / aspect) : PREVIEW_SIDE;
    const fit = cropFit(image.naturalWidth, image.naturalHeight, e, w, h);
    const k = canvas.getBoundingClientRect().width / canvas.width; // screen px per preview px
    pan.current = { x: ev.clientX, y: ev.clientY, cx: e.cropX, cy: e.cropY, sx: fit.slackX * k, sy: fit.slackY * k };
    ev.currentTarget.setPointerCapture(ev.pointerId);
  };
  const movePan = (ev: ReactPointerEvent<HTMLElement>) => {
    const p = pan.current;
    if (!p) return;
    // dragging right moves the photo right, i.e. reveals more of its left side
    const cropX = p.sx ? clamp(p.cx - (ev.clientX - p.x) / p.sx, -1, 1) : p.cx;
    const cropY = p.sy ? clamp(p.cy - (ev.clientY - p.y) / p.sy, -1, 1) : p.cy;
    setCfg((c) => ({ ...c, effects: { ...c.effects, cropX, cropY } }));
  };
  const endPan = () => (pan.current = null);

  // Crop grid: drag a corner or edge to resize the frame (past the current crop, up to the photo's edge).
  // The box is in fractions of the current crop; on release it becomes shape + zoom + pan.
  type Box = { x0: number; y0: number; x1: number; y1: number };
  const FULL: Box = { x0: 0, y0: 0, x1: 1, y1: 1 };
  const [box, setBox] = useState<Box>(FULL);
  const boxDrag = useRef<{ h: string; x: number; y: number; w: number; hgt: number; start: Box; lim: Box; lock: boolean } | null>(null);
  const lockAspect = e.aspect !== 'free' || e.anamorphic > 0;
  const startBox = (ev: ReactPointerEvent<HTMLElement>, h: string) => {
    const canvas = canvasRef.current;
    if (!cropping || !image || !canvas) return;
    ev.stopPropagation(); // not a pan
    try {
      ev.currentTarget.setPointerCapture(ev.pointerId);
    } catch {
      /* synthetic pointer */
    }
    const aspect = processedAspect(image, e);
    const v = cropView(image.naturalWidth, image.naturalHeight, e, aspect);
    const left = v.cx - v.vw / 2;
    const top = v.cy - v.vh / 2;
    const r = canvas.getBoundingClientRect();
    boxDrag.current = {
      h,
      x: ev.clientX,
      y: ev.clientY,
      w: r.width,
      hgt: r.height,
      start: box,
      lim: { x0: -left / v.vw, y0: -top / v.vh, x1: (v.rw - left) / v.vw, y1: (v.rh - top) / v.vh },
      lock: lockAspect,
    };
  };
  const moveBox = (ev: ReactPointerEvent<HTMLElement>) => {
    const d = boxDrag.current;
    if (!d) return;
    const dx = (ev.clientX - d.x) / d.w;
    const dy = (ev.clientY - d.y) / d.hgt;
    const MIN = 0.12;
    const b = { ...d.start };
    if (d.lock) {
      // corners only, same shape: width and height fractions stay equal; the opposite corner is the anchor
      const sx = d.h.includes('e') ? 1 : -1;
      const sy = d.h.includes('s') ? 1 : -1;
      const ax = sx > 0 ? b.x0 : b.x1;
      const ay = sy > 0 ? b.y0 : b.y1;
      const room = Math.min(sx > 0 ? d.lim.x1 - ax : ax - d.lim.x0, sy > 0 ? d.lim.y1 - ay : ay - d.lim.y0);
      const size = clamp((b.x1 - b.x0 + sx * dx + (b.y1 - b.y0) + sy * dy) / 2, MIN, room);
      if (sx > 0) b.x1 = ax + size;
      else b.x0 = ax - size;
      if (sy > 0) b.y1 = ay + size;
      else b.y0 = ay - size;
    } else {
      if (d.h.includes('w')) b.x0 = clamp(b.x0 + dx, d.lim.x0, b.x1 - MIN);
      if (d.h.includes('e')) b.x1 = clamp(b.x1 + dx, b.x0 + MIN, d.lim.x1);
      if (d.h.includes('n')) b.y0 = clamp(b.y0 + dy, d.lim.y0, b.y1 - MIN);
      if (d.h.includes('s')) b.y1 = clamp(b.y1 + dy, b.y0 + MIN, d.lim.y1);
    }
    setBox(b);
  };
  const endBox = () => {
    const d = boxDrag.current;
    boxDrag.current = null;
    if (!d || !image) return;
    const b = box;
    setBox(FULL);
    if (Math.abs(b.x0) + Math.abs(b.y0) + Math.abs(b.x1 - 1) + Math.abs(b.y1 - 1) < 0.005) return;
    const r = cropFromBox(image.naturalWidth, image.naturalHeight, e, processedAspect(image, e), b, d.lock);
    setCrop(d.lock ? { zoom: r.zoom, cropX: r.cropX, cropY: r.cropY } : { aspect: 'free', cropRatio: r.ratio, zoom: r.zoom, cropX: r.cropX, cropY: r.cropY });
  };
  const cropTouched = (Object.keys(CROP_RESET) as (keyof typeof CROP_RESET)[]).some((k) => e[k] !== CROP_RESET[k]);
  const stampDef = STAMP_STYLES.find((s) => s.id === e.stamp);
  // every look, effect, stamp and frame off — only the crop stays
  const plainCfg = (): ProcessConfig => {
    const base = configForPreset('none');
    return { ...base, effects: { ...base.effects, aspect: e.aspect, rotate: e.rotate, flip: e.flip, straighten: e.straighten, zoom: e.zoom, cropX: e.cropX, cropY: e.cropY, cropRatio: e.cropRatio } };
  };
  const isPlain = JSON.stringify(cfg) === JSON.stringify(plainCfg());
  const setCrop = (patch: Partial<Effects>) => setCfg((c) => ({ ...c, effects: { ...c.effects, ...patch } }));
  const setLook = (key: keyof Look, value: number) => setCfg((c) => ({ ...c, look: { ...c.look, [key]: value } }));
  const setFx = <K extends keyof Effects>(key: K, value: Effects[K]) =>
    setCfg((c) => ({ ...c, effects: { ...c.effects, [key]: value } }));

  const render = () => {
    if (!image) throw new Error('No image');
    return renderProcessed(image, cfg, { longSide: 2000, date, double, booth });
  };

  const save = async (asCopy: boolean) => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const canvas = render();
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      const original = target.record?.original ?? target.blob;
      const base = {
        blob,
        mime: 'image/jpeg',
        width: canvas.width,
        height: canvas.height,
        original,
        process: cfg,
        camRaw,
        camera: target.record?.camera,
        camStripped: stripCam && Boolean(camRaw),
        developed: true,
        filterName: cfg.presetId === 'none' ? 'Processed' : presetName(cfg.presetId),
      };
      const record: PhotoRecord =
        target.record && !asCopy
          ? { ...target.record, ...base }
          : {
              ...base,
              id: uid(),
              name: `${(target.record?.name ?? target.fileName.replace(/\.[^.]+$/, '')).slice(0, 40)}${asCopy ? ' · copy' : ''}`,
              createdAt: Date.now(),
              kind: 'still',
              note: 'Processed in Delineate',
            };
      const keepOriginal = asCopy && !target.record && image;
      if (keepOriginal) {
        await onSave({
          id: uid(),
          name: target.fileName.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported photo',
          createdAt: Date.now() - 1, // sorts just after its edited copy
          blob: target.blob,
          mime: target.blob.type || 'image/jpeg',
          width: image.naturalWidth,
          height: image.naturalHeight,
          filterName: 'Original',
          kind: 'still',
          developed: true,
          note: 'Imported original, untouched',
        });
      }
      await onSave(record);
      onTarget(null); // back to the picker, ready for the next print
      playSuccess();
      notify(
        keepOriginal
          ? 'Saved the original and an edited copy to your archive.'
          : asCopy
            ? 'Edited copy saved. The original is unchanged.'
            : target.record
              ? 'Archive frame updated — you can re-edit it any time.'
              : 'Saved to your archive.',
      );
    } catch (error) {
      console.error(error);
      notify('Could not process this image.', 'warning');
    } finally {
      setBusy(false);
    }
  };

  const download = async () => {
    if (!target) return;
    const blob = await canvasToBlob(render(), 'image/jpeg', 0.92);
    downloadBlob(blob, `${fileSlug(target.fileName)}-${fileSlug(presetName(cfg.presetId))}.jpg`);
  };

  const pickSource = (id: string) => {
    const rec = byId.get(id);
    if (rec) onTarget({ record: rec, blob: rec.blob, fileName: rec.name });
    setPicker(null);
  };

  if (!target) {
    return (
      <div className="process-page page-enter">
        <div className="page-kicker-row">
          <div className="page-kicker">
            <span className="eyebrow">Process / 03</span>
            <p>Grade your prints — film stocks, effects, frames — or leave them honest.</p>
          </div>
        </div>
        <EmptyState
          icon={<Wand2 size={26} />}
          title="Choose a print to process"
          body="Pick a developed photo from your archive or import one from your device."
          action={
            <div className="empty-actions">
              <button type="button" className="button button-dark" onClick={() => setPicker('source')}>
                <Layers size={15} /> From archive
              </button>
              <button type="button" className="button button-outline" onClick={onImport}>
                <ImagePlus size={15} /> Import
              </button>
            </div>
          }
        />
        {picker && <PhotoPicker photos={photos} onPick={pickSource} onClose={() => setPicker(null)} />}
      </div>
    );
  }

  return (
    <div className="process-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Process / 03</span>
          <p>Grade your prints — film stocks, effects, frames — or leave them honest.</p>
        </div>
        <div className="pr-top-actions is-two-row">
          <button type="button" className="button button-outline" onClick={() => setPicker('source')}>
            <Layers size={14} /> Change photo
          </button>
          <button type="button" className="button button-outline" onClick={() => onTarget(null)} title="Discard these edits and exit">
            <X size={14} /> Discard
          </button>
          <button type="button" className="button button-outline" onClick={() => setCfg(plainCfg())} disabled={isPlain} title="Turn off every filter, effect, stamp and frame. Your crop stays.">
            <Eraser size={14} /> Strip filters
          </button>
          <button
            type="button"
            className={`button button-outline ${stripCam ? 'is-active' : ''}`}
            aria-pressed={stripCam}
            disabled={!camRaw}
            onClick={() => {
              setStripCam((v) => !v);
              notify(stripCam ? `${target.record?.camera ?? 'Camera'} look restored.` : `${target.record?.camera ?? 'Camera'} look removed — editing the clean capture.`);
            }}
            title={
              camRaw
                ? "Remove the camera body's built-in look (its colour, sensor resolution, pixel/tape effects, date imprint and print frame)"
                : 'Only for photos shot with the camera since version 1.2 — they keep a clean copy without the camera look'
            }
          >
            <CameraOff size={14} /> {stripCam ? 'Restore cam FX' : 'Strip cam FX'}
          </button>
          <button type="button" className="button button-outline" onClick={() => void download()} disabled={!image}>
            <Download size={14} /> Download
          </button>
          <button
            type="button"
            className="button button-outline"
            onClick={() => void save(true)}
            disabled={busy || !image}
            title={target.record ? 'Save the edit as a new archive photo; the original stays as it is' : 'Save the untouched original and an edited copy'}
          >
            <Copy size={14} /> {target.record ? 'Save copy' : 'Save original + copy'}
          </button>
          <button type="button" className="button button-dark" onClick={() => void save(false)} disabled={busy || !image}>
            <Save size={14} /> {target.record ? 'Update' : 'Save'}
          </button>
        </div>
      </div>

      <div className="pr-layout">
        <aside className="pr-presets">
          <div className="pr-groups" role="tablist">
            {[MINE, ...PRESET_GROUPS].map((g) => (
              <button key={g} type="button" role="tab" aria-selected={group === g} className={group === g ? 'is-active' : ''} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
          {group === MINE ? (
            <div className="pr-preset-list">
              {draftName === null ? (
                <button type="button" className="pr-mine-save" onClick={() => setDraftName('')}>
                  <BookmarkPlus size={15} /> Save current look as a preset
                </button>
              ) : (
                <form
                  className="pr-mine-form"
                  onSubmit={(ev) => {
                    ev.preventDefault();
                    void saveMine();
                  }}
                >
                  <input
                    autoFocus
                    value={draftName}
                    maxLength={32}
                    placeholder={`My preset ${mine.length + 1}`}
                    aria-label="Preset name"
                    onChange={(ev) => setDraftName(ev.target.value)}
                    onKeyDown={(ev) => ev.key === 'Escape' && setDraftName(null)}
                  />
                  <button type="submit" className="round-icon small" aria-label="Save preset">
                    <Check size={13} />
                  </button>
                  <button type="button" className="round-icon small" aria-label="Cancel" onClick={() => setDraftName(null)}>
                    <X size={13} />
                  </button>
                </form>
              )}
              {mineSorted.length === 0 && (
                <p className="pr-mine-empty">Grade a photo the way you like it, then save the look here to reuse on any print.</p>
              )}
              {mineSorted.map((p) => {
                const active = cfg.presetId === MINE_PREFIX + p.id;
                return (
                  <div key={p.id} className="pr-mine-row">
                    <button type="button" className={`pr-preset ${active ? 'is-active' : ''}`} onClick={() => applyPreset(MINE_PREFIX + p.id, p.look, p.effects)}>
                      <span className="pr-swatch" style={{ background: mineSwatch(p) }}>
                        {active && <Check size={14} />}
                      </span>
                      <span>
                        <strong>{p.name}</strong>
                        <small>Saved {new Date(p.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</small>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`pr-mine-icon ${p.favorite ? 'is-fav' : ''}`}
                      aria-pressed={p.favorite}
                      aria-label={`Favourite ${p.name}`}
                      onClick={() => toggleFavorite(p)}
                    >
                      <Star size={14} fill={p.favorite ? 'currentColor' : 'none'} />
                    </button>
                    <button
                      type="button"
                      className={`pr-mine-icon ${armed === p.id ? 'is-armed' : ''}`}
                      aria-label={armed === p.id ? `Tap again to delete ${p.name}` : `Delete ${p.name}`}
                      title={armed === p.id ? 'Tap again to delete' : 'Delete'}
                      onClick={() => removeMine(p)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
          <div className="pr-preset-list">
            {PRESETS.filter((p) => p.group === group).map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`pr-preset ${cfg.presetId === p.id ? 'is-active' : ''}`}
                onClick={() => choosePreset(p.id)}
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <span className="pr-swatch" style={{ background: `linear-gradient(135deg, ${p.swatch.join(', ')})` }}>
                  {cfg.presetId === p.id && <Check size={14} />}
                </span>
                <span>
                  <strong>{p.name}</strong>
                  <small>{p.note}</small>
                </span>
              </button>
            ))}
          </div>
          )}
        </aside>

        <section className="pr-stage">
          <div className="pr-canvas-wrap">
            <span
              className={`pr-canvas-frame ${e.gateWeave > 0 ? 'is-weaving' : ''} ${e.crt > 0 ? 'is-crt' : ''} ${cropping ? 'is-cropping' : ''}`}
              style={{ opacity: comparing ? 0 : 1 }}
              onPointerDown={startPan}
              onPointerMove={movePan}
              onPointerUp={endPan}
              onPointerCancel={endPan}
            >
              <canvas ref={canvasRef} className="pr-canvas" />
              {cropping && (
                <span
                  className={`pr-cropbox ${lockAspect ? 'is-locked' : ''}`}
                  style={{ left: `${box.x0 * 100}%`, top: `${box.y0 * 100}%`, width: `${(box.x1 - box.x0) * 100}%`, height: `${(box.y1 - box.y0) * 100}%` }}
                >
                  {(lockAspect ? ['nw', 'ne', 'sw', 'se'] : ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']).map((h) => (
                    <i key={h} className={`pr-crop-h is-${h}`} onPointerDown={(ev) => startBox(ev, h)} onPointerMove={moveBox} onPointerUp={endBox} onPointerCancel={endBox} aria-hidden="true" />
                  ))}
                </span>
              )}
              {e.videoGrain > 0 && <span className="pr-live-grain" style={{ opacity: e.videoGrain * 0.55 }} aria-hidden="true" />}
            </span>
            {comparing && sourceUrl && <img className="pr-original" src={sourceUrl} alt="Original" />}
            {comparing && <span className="pr-before-tag">Before</span>}
            {!image && <span className="pr-loading">Loading…</span>}
          </div>
          <div className="pr-stage-foot">
            <button
              type="button"
              className={`button button-outline pr-compare ${comparing ? 'is-active' : ''}`}
              onPointerDown={(ev) => {
                ev.currentTarget.setPointerCapture(ev.pointerId);
                setComparing(true);
              }}
              onPointerUp={() => setComparing(false)}
              onPointerCancel={() => setComparing(false)}
              onLostPointerCapture={() => setComparing(false)}
              onKeyDown={(ev) => {
                if (ev.key !== ' ' && ev.key !== 'Enter') return;
                ev.preventDefault();
                setComparing(true);
              }}
              onKeyUp={() => setComparing(false)}
              onBlur={() => setComparing(false)}
              onContextMenu={(ev) => ev.preventDefault()}
            >
              <Eye size={14} /> Hold to compare
            </button>
            <span className="pr-name">{target.fileName} · {presetName(cfg.presetId)}</span>
          </div>
        </section>

        <aside className="pr-controls">
          <div className="segmented pr-tabs">
            <button type="button" className={panel === 'effects' ? 'is-active' : ''} onClick={() => setPanel('effects')}>
              <Wand2 size={13} /> Effects
            </button>
            <button type="button" className={panel === 'adjust' ? 'is-active' : ''} onClick={() => setPanel('adjust')}>
              <SlidersHorizontal size={13} /> Adjust
            </button>
            <button type="button" className={panel === 'crop' ? 'is-active' : ''} onClick={() => setPanel('crop')}>
              <Crop size={13} /> Crop
            </button>
          </div>

          {panel === 'crop' ? (
            <div className="pr-group">
              <div className="pr-field">
                <span className="eyebrow">Aspect ratio</span>
                <div className="segmented pr-aspects">
                  {ASPECTS.map((a) => (
                    <button key={a.id} type="button" className={e.aspect === a.id ? 'is-active' : ''} onClick={() => setCrop(a.id === 'free' ? { aspect: 'free', cropRatio: image ? processedAspect(image, e) : e.cropRatio } : { aspect: a.id, cropX: 0, cropY: 0 })}>
                      {a.label}
                    </button>
                  ))}
                </div>
                {e.anamorphic > 0 && <small className="pr-hint">Anamorphic widescreen is on, so the frame stays 2.39:1.</small>}
              </div>
              <div className="pr-field">
                <span className="eyebrow">Rotate &amp; flip</span>
                <div className="pr-crop-tools">
                  <button type="button" className="button button-outline" onClick={() => setCrop({ rotate: (e.rotate + 270) % 360, cropX: 0, cropY: 0 })}>
                    <RotateCcwSquare size={14} /> Left
                  </button>
                  <button type="button" className="button button-outline" onClick={() => setCrop({ rotate: (e.rotate + 90) % 360, cropX: 0, cropY: 0 })}>
                    <RotateCwSquare size={14} /> Right
                  </button>
                  <button type="button" aria-pressed={e.flip} className={`button button-outline ${e.flip ? 'is-on' : ''}`} onClick={() => setCrop({ flip: !e.flip })}>
                    <FlipHorizontal2 size={14} /> Flip
                  </button>
                </div>
              </div>
              <Range label="Straighten" min={-15} max={15} step={0.1} value={e.straighten} display={`${e.straighten > 0 ? '+' : ''}${e.straighten.toFixed(1)}°`} onChange={(v) => setCrop({ straighten: v })} />
              <Range label="Zoom" min={1} max={4} step={0.01} value={e.zoom} display={`${e.zoom.toFixed(2)}×`} onChange={(v) => setCrop({ zoom: v })} />
              <small className="pr-hint">
                {e.booth ? 'In a booth strip the crop applies to your photo’s square cell.' : 'Drag the corners or edges of the grid to resize the frame, and drag the photo to line it up inside it. Pick Free for any shape.'}
              </small>
              <button type="button" className="text-button pr-crop-reset" disabled={!cropTouched && e.aspect !== 'free'} onClick={() => setCrop(e.aspect === 'free' ? { ...CROP_RESET, aspect: 'original', cropRatio: undefined } : CROP_RESET)}>
                <RotateCcw size={12} /> Reset crop
              </button>
            </div>
          ) : panel === 'adjust' ? (
            <div className="pr-group">
              {ADJUST.map((a) => {
                const value = (cfg.look[a.key] as number | undefined) ?? 0;
                return (
                  <Range key={a.key} label={a.label} min={a.min} max={a.max} step={a.step} value={value} display={a.fmt ? a.fmt(value) : String(value)} onChange={(v) => setLook(a.key, v)} />
                );
              })}
              <div className="pr-field">
                <span className="eyebrow">Grain size</span>
                <div className="segmented">
                  {GRAIN_SIZES.map((g) => (
                    <button key={g} type="button" className={(cfg.look.grainSize ?? 'medium') === g ? 'is-active' : ''} onClick={() => setCfg((c) => ({ ...c, look: { ...c.look, grainSize: g } }))}>
                      {g[0].toUpperCase() + g.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="pr-group">
              {FX_GROUPS.map((group, gi) => {
                const active = group.items.filter((f) => (e[f.key] as number) > 0).length;
                return (
                  <details key={group.name} className="pr-fx-group" open={gi === 0}>
                    <summary>
                      {group.name}
                      {active > 0 && <span className="pr-fx-count">{active}</span>}
                    </summary>
                    <div className="pr-fx-items">
                      {group.items.map((f) => (
                        <Range key={f.key} label={f.label} min={0} max={1} step={0.01} value={e[f.key] as number} display={`${Math.round((e[f.key] as number) * 100)}`} onChange={(v) => setFx(f.key, v as never)} />
                      ))}
                    </div>
                  </details>
                );
              })}

              <div className="pr-field">
                <span className="eyebrow">Date stamp</span>
                <div className="pr-stamps">
                  {STAMP_STYLES.map((s) => (
                    <button key={s.id} type="button" className={`pr-stamp ${e.stamp === s.id ? 'is-active' : ''}`} onClick={() => setFx('stamp', s.id)} aria-pressed={e.stamp === s.id}>
                      <i className={`stamp-sample stamp-${s.id}`} style={s.id === 'dymo' ? undefined : { color: e.stamp === s.id ? (e.stampColor ?? s.color ?? undefined) : (s.color ?? undefined) }}>
                        {STAMP_SAMPLE[s.id]}
                      </i>
                      <small>{s.label}</small>
                    </button>
                  ))}
                </div>
                {stampDef && stampDef.id !== 'none' && (
                  <div className="pr-stamp-opts">
                    {stampDef.corner && (
                      <div className="pr-corners" role="group" aria-label="Stamp corner">
                        {(['tl', 'tr', 'bl', 'br'] as const).map((c) => (
                          <button key={c} type="button" className={e.stampPos === c ? 'is-active' : ''} aria-pressed={e.stampPos === c} aria-label={CORNER_LABEL[c]} title={CORNER_LABEL[c]} onClick={() => setFx('stampPos', c)}>
                            <i />
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="jr-swatches pr-stamp-colors">
                      <button type="button" className={`pr-swatch-auto ${e.stampColor === null ? 'is-active' : ''}`} onClick={() => setFx('stampColor', null)} aria-label="Style colour" title="Style colour" style={{ background: stampDef.color ?? '#fff' }} />
                      {STAMP_COLORS.map((c) => (
                        <button key={c} type="button" style={{ background: c }} className={e.stampColor === c ? 'is-active' : ''} onClick={() => setFx('stampColor', c)} aria-label={`Stamp colour ${c}`} />
                      ))}
                      <input type="color" value={e.stampColor ?? stampDef.color ?? '#ffffff'} onChange={(ev) => setFx('stampColor', ev.target.value)} aria-label="Custom stamp colour" />
                    </div>
                    <div className="pr-stamp-date">
                      <label>
                        <span>Date</span>
                        <input type="date" value={toDateInput(e.stampDate ?? date)} onChange={(ev) => setFx('stampDate', fromDateInput(ev.target.value, e.stampDate ?? date))} />
                      </label>
                      <button type="button" className="text-button" onClick={() => setFx('stampDate', withYear(e.stampDate ?? date, 1998))}>’98</button>
                      {e.stampDate !== null && (
                        <button type="button" className="text-button" onClick={() => setFx('stampDate', null)}>Photo date</button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="pr-field">
                <span className="eyebrow">Double exposure</span>
                <div className="pr-double">
                  <button type="button" className="pr-slot" onClick={() => setPicker('double')}>
                    {e.doubleId && byId.get(e.doubleId) ? <Thumb photo={byId.get(e.doubleId)!} /> : <ImagePlus size={16} />}
                  </button>
                  {e.doubleId ? (
                    <>
                      <Range label="Blend" min={0} max={1} step={0.01} value={e.doubleMix} display={`${Math.round(e.doubleMix * 100)}`} onChange={(v) => setFx('doubleMix', v)} />
                      <button type="button" className="round-icon small" onClick={() => setFx('doubleId', null)} aria-label="Remove double exposure">
                        <X size={12} />
                      </button>
                    </>
                  ) : (
                    <small>Layer a second frame on top</small>
                  )}
                </div>
              </div>

              <div className="pr-field">
                <span className="eyebrow">Film frame border</span>
                <div className="pr-frames">
                  {FRAME_STYLES.map((f) => (
                    <button key={f.id} type="button" className={e.border === f.id ? 'is-active' : ''} onClick={() => setFx('border', f.id)} title={f.label}>
                      <span style={{ background: f.swatch }} />
                      <small>{f.label}</small>
                    </button>
                  ))}
                </div>
                {CAPTION_FRAMES.includes(e.border) && (
                  <input
                    className="text-input pr-caption"
                    value={e.caption}
                    maxLength={40}
                    placeholder="Write a caption on the frame…"
                    aria-label="Frame caption"
                    onChange={(ev) => setFx('caption', ev.target.value)}
                  />
                )}
              </div>

              <div className="pr-field">
                <Toggle checked={e.booth} onChange={(v) => setFx('booth', v)} label="2×2 photo booth strip" />
                {e.booth && (
                  <button type="button" className="text-button" onClick={() => setPicker('booth')}>
                    Choose up to 3 more frames ({e.boothIds.length}/3)
                  </button>
                )}
              </div>
            </div>
          )}

        </aside>
      </div>

      {picker && (
        <PhotoPicker
          photos={picker === 'source' ? photos : photos.filter((p) => p.id !== target.record?.id)}
          title={picker === 'double' ? 'Second exposure' : picker === 'booth' ? 'Photo booth frames' : 'Choose a photo'}
          selected={picker === 'booth' ? e.boothIds : picker === 'double' && e.doubleId ? [e.doubleId] : []}
          onPick={(id) => {
            if (picker === 'source') return pickSource(id);
            if (picker === 'double') {
              setFx('doubleId', id);
              setPicker(null);
              return;
            }
            setFx('boothIds', e.boothIds.includes(id) ? e.boothIds.filter((x) => x !== id) : [...e.boothIds, id].slice(-3));
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
