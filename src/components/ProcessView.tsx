import { Check, Copy, Download, Eye, ImagePlus, Layers, RotateCcw, Save, SlidersHorizontal, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Effects, EditTarget, Look, PhotoRecord } from '../types';
import { FRAME_STYLES } from '../lib/frames';
import { BASE_EFFECTS, PRESETS, PRESET_GROUPS, configForPreset, getPreset, renderProcessed } from '../lib/process';
import { FX_GROUPS } from '../lib/fx';
import { canvasToBlob, downloadBlob, fileSlug, loadImage, uid } from '../lib/utils';
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
  { key: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.01, fmt: (v) => `${((v - 1) * 100).toFixed(0)}` },
  { key: 'warmth', label: 'Warmth', min: -60, max: 60, step: 1 },
  { key: 'tint', label: 'Tint', min: -40, max: 40, step: 1 },
  { key: 'fade', label: 'Fade', min: 0, max: 0.6, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
  { key: 'split', label: 'Split tone', min: 0, max: 0.6, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
  { key: 'grain', label: 'Grain', min: 0, max: 80, step: 1 },
  { key: 'lightLeak', label: 'Light leak', min: 0, max: 0.8, step: 0.01, fmt: (v) => `${Math.round(v * 100)}` },
  { key: 'blur', label: 'Soft focus', min: 0, max: 3, step: 0.1 },
];

export default function ProcessView({ photos, target, onTarget, onSave, onImport, notify }: ProcessViewProps) {
  const [cfg, setCfg] = useState(() => target?.record?.process ?? configForPreset('none'));
  const [group, setGroup] = useState(() => getPreset(cfg.presetId).group);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [double, setDouble] = useState<HTMLImageElement | null>(null);
  const [booth, setBooth] = useState<HTMLImageElement[]>([]);
  const [picker, setPicker] = useState<null | 'source' | 'double' | 'booth'>(null);
  const [comparing, setComparing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<'adjust' | 'effects'>('effects');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const sourceBlob = target ? (target.record?.original ?? target.blob) : null;
  const sourceUrl = useObjectUrl(sourceBlob);
  const date = target?.record?.createdAt ?? Date.now();
  const e = cfg.effects;

  // New target → restore its saved configuration (re-editable from the archive).
  useEffect(() => {
    const restored = target?.record?.process ?? configForPreset('none');
    setCfg({ ...restored, effects: { ...BASE_EFFECTS, ...restored.effects } }); // older saves lack newer effects
    setGroup(getPreset(restored.presetId).group);
  }, [target]);

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
      const out = renderProcessed(image, cfg, { longSide: 900, date, double, booth });
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = out.width;
      canvas.height = out.height;
      canvas.getContext('2d')!.drawImage(out, 0, 0);
    }, 50);
    return () => window.clearTimeout(t);
  }, [image, cfg, date, double, booth]);

  const choosePreset = (id: string) => {
    const next = configForPreset(id);
    // keep user-chosen composition (borders/booth/double) unless the preset sets its own
    const preset = getPreset(id);
    setCfg({
      ...next,
      effects: {
        ...next.effects,
        doubleId: e.doubleId,
        doubleMix: e.doubleMix,
        booth: e.booth,
        boothIds: e.boothIds,
        border: preset.effects?.border ?? e.border,
      },
    });
    playPop();
    haptic(8);
  };
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
      const preset = getPreset(cfg.presetId);
      const original = target.record?.original ?? target.blob;
      const base = {
        blob,
        mime: 'image/jpeg',
        width: canvas.width,
        height: canvas.height,
        original,
        process: cfg,
        developed: true,
        filterName: preset.id === 'none' ? 'Processed' : preset.name,
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
      await onSave(record);
      onTarget(null); // back to the picker, ready for the next print
      playSuccess();
      notify(asCopy || !target.record ? 'Saved to your archive.' : 'Archive frame updated — you can re-edit it any time.');
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
    downloadBlob(blob, `${fileSlug(target.fileName)}-${cfg.presetId}.jpg`);
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
        <div className="pr-top-actions">
          <button type="button" className="button button-outline" onClick={() => setPicker('source')}>
            <Layers size={14} /> Change photo
          </button>
          <button type="button" className="button button-outline" onClick={() => onTarget(null)} aria-label="Close">
            <X size={14} />
          </button>
        </div>
      </div>

      <div className="pr-layout">
        <aside className="pr-presets">
          <div className="pr-groups" role="tablist">
            {PRESET_GROUPS.map((g) => (
              <button key={g} type="button" role="tab" aria-selected={group === g} className={group === g ? 'is-active' : ''} onClick={() => setGroup(g)}>
                {g}
              </button>
            ))}
          </div>
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
        </aside>

        <section className="pr-stage">
          <div className="pr-canvas-wrap">
            <span className={`pr-canvas-frame ${e.gateWeave > 0 ? 'is-weaving' : ''} ${e.crt > 0 ? 'is-crt' : ''}`} style={{ opacity: comparing ? 0 : 1 }}>
              <canvas ref={canvasRef} className="pr-canvas" />
              {e.videoGrain > 0 && <span className="pr-live-grain" style={{ opacity: e.videoGrain * 0.55 }} aria-hidden="true" />}
            </span>
            {comparing && sourceUrl && <img className="pr-original" src={sourceUrl} alt="Original" />}
            {!image && <span className="pr-loading">Loading…</span>}
          </div>
          <div className="pr-stage-foot">
            <button
              type="button"
              className="button button-outline"
              onPointerDown={() => setComparing(true)}
              onPointerUp={() => setComparing(false)}
              onPointerLeave={() => setComparing(false)}
            >
              <Eye size={14} /> Hold to compare
            </button>
            <span className="pr-name">{target.fileName} · {getPreset(cfg.presetId).name}</span>
            <button type="button" className="round-icon small" title="Reset" onClick={() => setCfg(configForPreset('none'))}>
              <RotateCcw size={14} />
            </button>
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
          </div>

          {panel === 'adjust' ? (
            <div className="pr-group">
              {ADJUST.map((a) => {
                const value = (cfg.look[a.key] as number | undefined) ?? 0;
                return (
                  <Range key={a.key} label={a.label} min={a.min} max={a.max} step={a.step} value={value} display={a.fmt ? a.fmt(value) : String(value)} onChange={(v) => setLook(a.key, v)} />
                );
              })}
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
                <div className="segmented">
                  {(['none', 'date', 'camcorder'] as const).map((s) => (
                    <button key={s} type="button" className={e.stamp === s ? 'is-active' : ''} onClick={() => setFx('stamp', s)}>
                      {s === 'none' ? 'Off' : s === 'date' ? 'Film date' : 'Camcorder'}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pr-field">
                <span className="eyebrow">Aspect ratio</span>
                <div className="segmented">
                  {(['original', '4:3', '1:1'] as const).map((s) => (
                    <button key={s} type="button" className={e.aspect === s ? 'is-active' : ''} onClick={() => setFx('aspect', s)}>
                      {s === 'original' ? 'Original' : s}
                    </button>
                  ))}
                </div>
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

          <div className="pr-actions">
            <button type="button" className="button button-dark button-full" onClick={() => void save(false)} disabled={busy || !image}>
              <Save size={14} /> {target.record ? 'Update in archive' : 'Save to archive'}
            </button>
            {target.record && (
              <button type="button" className="button button-outline" onClick={() => void save(true)} disabled={busy || !image}>
                <Copy size={14} /> Save copy
              </button>
            )}
            <button type="button" className="button button-outline" onClick={() => void download()} disabled={!image}>
              <Download size={14} /> Download
            </button>
          </div>
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
