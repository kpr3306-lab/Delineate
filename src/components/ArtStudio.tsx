import {
  Archive,
  Check,
  Download,
  Film,
  Grid2x2,
  ImagePlus,
  Pause,
  Play,
  RotateCcw,
  Images,
  Save,
  Shapes,
  Shuffle,
  Sparkles,
  WandSparkles,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FrameStyle, PhotoRecord } from '../types';
import { applyFrame } from '../lib/frames';
import FramePicker, { type FrameValue } from './FramePicker';
import {
  DEFAULT_ART,
  PALETTES,
  PIXEL_PALETTES,
  encodeAnimation,
  renderAnimatedFrame,
  renderArtStill,
  type AbstractMode,
  type AnimationMode,
  type ArtSettings,
  type ArtStyle,
  type GeometricPattern,
  type PaletteKey,
  type PixelPalette,
  type PixelShape,
} from '../lib/art';
import {
  canvasToBlob,
  downloadBlob,
  fileSlug,
  loadImage,
  pad,
  uid,
} from '../lib/utils';
import { Range, Spinner, Toggle, useObjectUrl } from './ui';

type ArtStudioProps = {
  photos: PhotoRecord[];
  source: PhotoRecord | null;
  /** null closes the editor and goes back to the photo grid. */
  onSource: (record: PhotoRecord | null) => void;
  onSave: (record: PhotoRecord) => Promise<void>;
  onImport: () => void;
  notify: (message: string, tone?: 'default' | 'warning') => void;
};

const STYLE_META: Record<
  ArtStyle,
  { label: string; short: string; icon: typeof Sparkles; note: string }
> = {
  pixel: {
    label: 'Pixel study',
    short: 'Pixel',
    icon: Grid2x2,
    note: 'A low-resolution mosaic with a hand-picked palette.',
  },
  abstract: {
    label: 'Abstract swirl',
    short: 'Abstract',
    icon: WandSparkles,
    note: 'Luminance-driven color fields pulled into a gentle vortex.',
  },
  geometric: {
    label: 'Geometric cut',
    short: 'Geometric',
    icon: Shapes,
    note: 'The photograph rebuilt from facets, tiles and colored forms.',
  },
  animated: {
    label: 'Living loop',
    short: 'Animated',
    icon: Film,
    note: 'A looping GIF with breathing light, grain and VHS drift.',
  },
};

const PATTERNS: { id: GeometricPattern; label: string; note: string; icon: string }[] = [
  { id: 'triangles', label: 'Facets', note: 'Triangles cut along the edges in the photo.', icon: 'M2 2h20L2 22Z M22 2v20H2Z' },
  { id: 'blocks', label: 'Blocks', note: 'Squares that split smaller wherever there is detail.', icon: 'M2 2h10v10H2Z M14 2h8v4h-8Z M14 8h8v4h-8Z M2 14h20v8H2Z' },
  { id: 'mosaic', label: 'Mosaic', note: 'Hand-cut tiles set in grout.', icon: 'M3 3l8 1-1 7-7-1Z M13 3l8 1-1 8-8-1Z M3 13l7 0 1 8-8-1Z M13 14l8-1 0 8-8 0Z' },
  { id: 'hexagons', label: 'Hexagons', note: 'A honeycomb of even cells.', icon: 'M7 2l5 3v6l-5 3-5-3V5Z M17 2l5 3v6l-5 3-5-3V5Z M12 11l5 3v6l-5 3-5-3v-6Z' },
  { id: 'diamonds', label: 'Diamonds', note: 'Harlequin diamonds.', icon: 'M12 1l6 6-6 6-6-6Z M6 7l6 6-6 6-6-6Z M18 7l6 6-6 6-6-6Z M12 13l6 6-6 6-6-6Z' },
  { id: 'lowpoly', label: 'Low-poly', note: 'Folded-paper triangles on a jittered mesh.', icon: 'M2 3l9 2-3 8Z M11 5l11-2-6 9Z M8 13l3-8 5 7Z M2 3l6 10-6 9Z M8 13l8-1 6 10H2Z' },
  { id: 'glass', label: 'Glass', note: 'Stained glass: Voronoi panes with lead between them.', icon: 'M2 2h9l-2 8-7 2Z M11 2h11v7l-8 3-5-2Z M2 12l7-2 5 2 1 10H2Z M14 12l8-3v13h-7Z' },
  { id: 'orbs', label: 'Orbs', note: 'Glossy circles, bigger where it is bright.', icon: 'M7 7m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0 M17 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M12 17m-5 0a5 5 0 1 0 10 0a5 5 0 1 0-10 0' },
  { id: 'halftone', label: 'Halftone', note: 'A newspaper dot screen.', icon: 'M5 5m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M14 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M5 14m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M14 14m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0 M21 21m-1 0a1 1 0 1 0 2 0a1 1 0 1 0-2 0' },
  { id: 'engrave', label: 'Engraving', note: 'Banknote lines that swell in the shadows.', icon: 'M2 5q5-3 10 0t10 0v2q-5 3-10 0T2 7Z M2 12q5-3 10 0t10 0v3q-5 3-10 0T2 15Z M2 19q5-3 10 0t10 0v1q-5 3-10 0T2 20Z' },
];
/** Which settings each pattern actually uses, so the panel only shows what will change something. */
const USES_ADAPTIVE: GeometricPattern[] = ['triangles', 'blocks', 'mosaic', 'glass', 'orbs'];
const USES_JITTER: GeometricPattern[] = ['mosaic', 'lowpoly', 'glass', 'orbs', 'engrave'];
const USES_SEED: GeometricPattern[] = ['mosaic', 'lowpoly', 'glass', 'orbs'];
const LINE_LABEL: Partial<Record<GeometricPattern, string>> = {
  triangles: 'Outlines', blocks: 'Gaps', mosaic: 'Grout', hexagons: 'Outlines', diamonds: 'Outlines', lowpoly: 'Edges', glass: 'Lead lines', orbs: 'Rims',
};
const PIXEL_SHAPES: { id: PixelShape; label: string }[] = [
  { id: 'square', label: 'Square' },
  { id: 'dot', label: 'Dots' },
  { id: 'brick', label: 'Bricks' },
];
const ABSTRACT_MODES: { id: AbstractMode; label: string }[] = [
  { id: 'swirl', label: 'Swirl' },
  { id: 'ripple', label: 'Ripple' },
  { id: 'kaleido', label: 'Kaleido' },
  { id: 'marble', label: 'Marble' },
];

const MODE_LABELS: Record<AnimationMode, string> = {
  drift: 'Drift',
  vhs: 'VHS',
  pulse: 'Pulse',
};

const GIF_MODES: Record<AnimationMode, string> = {
  drift: 'A slow, cinematic parallax with breathing light.',
  vhs: 'Tracking lines, chromatic drift and late-night tape noise.',
  pulse: 'Colored light that swells and fades like a heartbeat.',
};

function StyleIcon({ style }: { style: ArtStyle }) {
  const Icon = STYLE_META[style].icon;
  return <Icon size={17} />;
}

function PickerCard({ photo, onPick }: { photo: PhotoRecord; onPick: () => void }) {
  const url = useObjectUrl(photo.blob);
  return (
    <button type="button" className="picker-card" onClick={onPick}>
      <span className="picker-image">{url && <img src={url} alt="" />}</span>
      <span className="picker-meta">
        <strong>{photo.name}</strong>
        <small>{photo.filterName}</small>
      </span>
      <span className="picker-check">
        <Check size={13} />
      </span>
    </button>
  );
}

export default function ArtStudio({
  photos,
  source,
  onSource,
  onSave,
  onImport,
  notify,
}: ArtStudioProps) {
  const [style, setStyle] = useState<ArtStyle>('pixel');
  const [frameV, setFrameV] = useState<FrameValue>({ border: 'none', caption: '', scale: 1, paper: null });
  const frameOpts = { scale: frameV.scale, paper: frameV.paper };
  const [shellAspect, setShellAspect] = useState(1);
  const [settings, setSettings] = useState<ArtSettings>({ ...DEFAULT_ART });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [busy, setBusy] = useState<'save' | 'download' | null>(null);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const aspect = useMemo(() => {
    if (!source) return 1;
    return source.width / source.height;
  }, [source]);

  useEffect(() => {
    if (!source) {
      setImage(null);
      return;
    }
    let cancelled = false;
    setImageError(false);
    loadImage(source.blob)
      .then((loaded) => {
        if (!cancelled) setImage(loaded);
      })
      .catch(() => {
        if (!cancelled) setImageError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [source]);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const previewLongSide = style === 'abstract' ? 680 : 960;
    const width = aspect >= 1 ? previewLongSide : Math.round(previewLongSide * aspect);
    const height = aspect >= 1 ? Math.round(previewLongSide / aspect) : previewLongSide;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d')!;

    if (style === 'animated') {
      let animationFrame = 0;
      const started = performance.now();
      const draw = (now: number) => {
        if (playing) {
          renderAnimatedFrame(context, image, width, height, settings, (now - started) / 1000);
          animationFrame = requestAnimationFrame(draw);
        }
      };
      renderAnimatedFrame(context, image, width, height, settings, (started - started) / 1000);
      if (playing) animationFrame = requestAnimationFrame(draw);
      return () => cancelAnimationFrame(animationFrame);
    }

    // debounced: fine stained glass or engraving takes a moment, and a slider fires on every step
    const t = window.setTimeout(() => {
      const rendered = applyFrame(renderArtStill(image, style, settings, previewLongSide), frameV.border, frameV.caption, Date.now(), frameOpts);
      canvas.width = rendered.width;
      canvas.height = rendered.height;
      setShellAspect(rendered.width / rendered.height);
      context.drawImage(rendered, 0, 0);
    }, 60);
    return () => window.clearTimeout(t);
  }, [image, style, settings, aspect, playing, frameV]);

  const updateSettings = <K extends keyof ArtSettings>(key: K, value: ArtSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const resetSettings = () => {
    setSettings({ ...DEFAULT_ART });
    notify('Art lab settings returned to defaults.');
  };

  const artName = () => {
    if (style === 'animated') {
      const count = photos.filter((photo) => photo.kind === 'animated').length + 1;
      return `Loop ${pad(count, 2)}`;
    }
    const count = photos.filter((photo) => photo.kind === 'art').length + 1;
    return `${STYLE_META[style].short} ${pad(count, 2)}`;
  };

  const makeArtifact = async (): Promise<{
    blob: Blob;
    mime: string;
    width: number;
    height: number;
    kind: 'art' | 'animated';
    filterName: string;
  }> => {
    if (!image) throw new Error('No source image.');
    if (style === 'animated') {
      setProgress(0);
      const blob = await encodeAnimation(image, settings, setProgress);
      const longSide = 520;
      const width = aspect >= 1 ? longSide : Math.round(longSide * aspect);
      const height = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
      return {
        blob,
        mime: 'image/gif',
        width,
        height,
        kind: 'animated',
        filterName: `Art Lab · ${MODE_LABELS[settings.animMode]}`,
      };
    }
    setProgress(0.4);
    const canvas = applyFrame(renderArtStill(image, style, settings, 1800), frameV.border, frameV.caption, Date.now(), frameOpts);
    const blob = await canvasToBlob(canvas, 'image/png');
    setProgress(1);
    return {
      blob,
      mime: 'image/png',
      width: canvas.width,
      height: canvas.height,
      kind: 'art',
      filterName: `Art Lab · ${STYLE_META[style].short}`,
    };
  };

  const download = async () => {
    if (!image || busy) return;
    setBusy('download');
    try {
      const artifact = await makeArtifact();
      downloadBlob(
        artifact.blob,
        `${fileSlug(artName())}.${artifact.mime.includes('gif') ? 'gif' : 'png'}`,
      );
      notify(
        artifact.kind === 'animated'
          ? 'Animated loop rendered and downloaded.'
          : 'Art study rendered and downloaded.',
      );
    } catch (error) {
      console.error(error);
      notify('The art lab could not finish this piece.', 'warning');
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  const save = async () => {
    if (!image || busy) return;
    setBusy('save');
    try {
      const artifact = await makeArtifact();
      const record: PhotoRecord = {
        id: uid(),
        name: artName(),
        createdAt: Date.now(),
        blob: artifact.blob,
        mime: artifact.mime,
        width: artifact.width,
        height: artifact.height,
        filterName: artifact.filterName,
        kind: artifact.kind,
        note: `${STYLE_META[style].label} made in the Art Lab`,
      };
      await onSave(record);
      notify(`${record.name} saved to your private archive.`);
      onSource(null); // done: back to the photo grid
    } catch (error) {
      console.error(error);
      notify('The art lab could not save this piece.', 'warning');
    } finally {
      setBusy(null);
      setProgress(0);
    }
  };

  const chooseSource = (record: PhotoRecord) => {
    onSource(record);
  };

  if (!source) {
    return (
      <div className="art-page page-enter">
        <div className="page-kicker-row">
          <div className="page-kicker">
            <span className="eyebrow">Studio / 07 · Art</span>
            <p>Turn a memory into something stranger.</p>
          </div>
          <div className="privacy-pill">
            <Sparkles size={12} />
            Generative tools · Rendered locally
          </div>
        </div>
        <section className="art-empty-hero">
          <div className="art-empty-copy">
            <span className="eyebrow">Choose your raw material</span>
            <h1>
              Make something <em>unexpected.</em>
            </h1>
            <p>
              Select a frame from your archive, then run it through Pixel, Abstract, Geometric or
              Living Loop. Every result is new — the original stays untouched.
            </p>
            <div className="hero-actions">
              <button className="button button-dark" type="button" onClick={onImport}>
                <ImagePlus size={15} /> Import a photo
              </button>
            </div>
          </div>
        </section>

        {photos.length > 0 ? (
          <section className="art-source-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">The contact sheet · {photos.length} frames</span>
                <h3>Tap a frame to transform it</h3>
              </div>
            </div>
            <div className="art-source-grid">
              {photos.map((photo) => (
                <PickerCard key={photo.id} photo={photo} onPick={() => chooseSource(photo)} />
              ))}
            </div>
          </section>
        ) : (
          <div className="art-empty-archive">
            <Archive size={26} />
            <div>
              <h3>No frames in the archive yet</h3>
              <p>Use the camera or import a photo, then come back here to transform it.</p>
            </div>
            <button className="button button-outline" type="button" onClick={onImport}>
              Import a photo
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="art-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Studio / 07 · Art</span>
          <p>Turn a memory into something stranger.</p>
        </div>
        <div className="pr-top-actions">
          <button type="button" className="button button-outline" onClick={() => onSource(null)}>
            <Images size={14} /> Change photo
          </button>
          <button type="button" className="button button-outline" onClick={() => onSource(null)} title="Discard this piece and exit">
            <X size={14} /> Discard
          </button>
          <button type="button" className="button button-outline" onClick={() => void download()} disabled={!image || busy !== null}>
            {busy === 'download' ? <Spinner /> : <Download size={14} />}
            {busy === 'download' ? 'Rendering…' : style === 'animated' ? 'Download GIF' : 'Download PNG'}
          </button>
          <button type="button" className="button button-dark" onClick={() => void save()} disabled={!image || busy !== null}>
            {busy === 'save' ? <Spinner /> : <Save size={14} />}
            {busy === 'save' ? 'Rendering…' : style === 'animated' ? 'Save GIF to archive' : 'Save art to archive'}
          </button>
        </div>
      </div>

      <section className="art-studio-header">
        <div>
          <h1>
            The <em>Art Lab</em>
          </h1>
          <p>Four ways to look at the same memory differently.</p>
        </div>
        <div className="art-style-switcher">
          {(Object.keys(STYLE_META) as ArtStyle[]).map((key) => (
            <button
              key={key}
              type="button"
              className={style === key ? 'is-active' : ''}
              onClick={() => setStyle(key)}
            >
              <StyleIcon style={key} />
              <span>{STYLE_META[key].short}</span>
            </button>
          ))}
        </div>
      </section>

      <div className="art-layout">
        <aside className="art-controls">
          <div className="art-controls-head">
            <div>
              <span className="eyebrow">Recipe</span>
              <h3>{STYLE_META[style].label}</h3>
            </div>
            <button className="round-icon small" type="button" onClick={resetSettings} title="Reset recipe">
              <RotateCcw size={14} />
            </button>
          </div>
          <p className="art-recipe-note">{STYLE_META[style].note}</p>

          {style !== 'pixel' && (
            <div className="art-control-group">
              <span className="eyebrow">Color story</span>
              {style !== 'animated' && (
                <div className="segmented art-segmented">
                  <button type="button" className={settings.colorMode === 'palette' ? 'is-active' : ''} onClick={() => updateSettings('colorMode', 'palette')}>Palette</button>
                  <button type="button" className={settings.colorMode === 'photo' ? 'is-active' : ''} onClick={() => updateSettings('colorMode', 'photo')}>Photo colours</button>
                </div>
              )}
              <div className={`palette-grid ${settings.colorMode === 'photo' && style !== 'animated' ? 'is-dimmed' : ''}`}>
                {(Object.keys(PALETTES) as PaletteKey[]).map((key) => {
                  const palette = PALETTES[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`palette-chip ${settings.palette === key ? 'is-active' : ''}`}
                      onClick={() => setSettings((current) => ({ ...current, palette: key, colorMode: 'palette' }))}
                    >
                      <span
                        className="palette-swatch"
                        style={{
                          background: `linear-gradient(90deg, ${palette.stops.join(', ')})`,
                        }}
                      />
                      <span>{palette.name}</span>
                      {settings.palette === key && <Check size={11} />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {style === 'pixel' && (
            <div className="art-control-group">
              <Range
                label="Pixel size"
                min={3}
                max={28}
                value={settings.pixelSize}
                display={`${settings.pixelSize}px`}
                onChange={(value) => updateSettings('pixelSize', value)}
              />
              <Range
                label="Colors"
                min={4}
                max={40}
                value={settings.colorCount}
                display={`${settings.colorCount}`}
                onChange={(value) => updateSettings('colorCount', value)}
              />
              <Toggle
                checked={settings.dither}
                onChange={(value) => updateSettings('dither', value)}
                label="Ordered dither"
              />
              <span className="eyebrow">Palette</span>
              <div className="palette-grid">
                {(['auto', ...Object.keys(PIXEL_PALETTES)] as PixelPalette[]).map((key) => (
                  <button
                    key={key}
                    type="button"
                    className={`palette-chip ${settings.pixelPalette === key ? 'is-active' : ''}`}
                    onClick={() => updateSettings('pixelPalette', key)}
                  >
                    <span
                      className="palette-swatch"
                      style={{
                        background: key === 'auto' ? 'conic-gradient(#e2566e, #f2c14e, #5f8a4e, #5b8bd9, #8d6fd1, #e2566e)' : `linear-gradient(90deg, ${PIXEL_PALETTES[key].colors.map((c, i, a) => `${c} ${(i / a.length) * 100}% ${((i + 1) / a.length) * 100}%`).join(', ')})`,
                      }}
                    />
                    <span>{key === 'auto' ? 'From photo' : PIXEL_PALETTES[key].name}</span>
                    {settings.pixelPalette === key && <Check size={11} />}
                  </button>
                ))}
              </div>
              <span className="eyebrow">Pixel shape</span>
              <div className="segmented art-segmented">
                {PIXEL_SHAPES.map((p) => (
                  <button key={p.id} type="button" className={settings.pixelShape === p.id ? 'is-active' : ''} onClick={() => updateSettings('pixelShape', p.id)}>{p.label}</button>
                ))}
              </div>
              <Toggle checked={settings.pixelGrid} onChange={(value) => updateSettings('pixelGrid', value)} label="Grid lines" />
            </div>
          )}

          {style === 'abstract' && (
            <div className="art-control-group">
              <div className="segmented art-segmented">
                {ABSTRACT_MODES.map((m) => (
                  <button key={m.id} type="button" className={settings.abstractMode === m.id ? 'is-active' : ''} onClick={() => updateSettings('abstractMode', m.id)}>{m.label}</button>
                ))}
              </div>
              {settings.abstractMode === 'kaleido' && (
                <Range label="Mirrors" min={3} max={16} value={settings.segments} display={`${settings.segments}`} onChange={(value) => updateSettings('segments', value)} />
              )}
              <Range
                label={settings.abstractMode === 'kaleido' ? 'Twist' : 'Intensity'}
                min={1}
                max={10}
                value={settings.abstractIntensity}
                display={`${settings.abstractIntensity}`}
                onChange={(value) => updateSettings('abstractIntensity', value)}
              />
              <Toggle
                checked={settings.outlines}
                onChange={(value) => updateSettings('outlines', value)}
                label="Contour texture"
              />
            </div>
          )}

          {style === 'geometric' && (
            <div className="art-control-group">
              <span className="eyebrow">Shape</span>
              <div className="art-patterns">
                {PATTERNS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={settings.pattern === p.id ? 'is-active' : ''}
                    onClick={() => updateSettings('pattern', p.id)}
                    title={p.note}
                    aria-pressed={settings.pattern === p.id}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d={p.icon} /></svg>
                    <small>{p.label}</small>
                  </button>
                ))}
              </div>
              <p className="art-mode-note">{PATTERNS.find((p) => p.id === settings.pattern)?.note}</p>
              <Range
                label="Detail"
                min={10}
                max={180}
                value={settings.detail}
                display={`${settings.detail} across`}
                onChange={(value) => updateSettings('detail', value)}
              />
              {USES_ADAPTIVE.includes(settings.pattern) && (
                <Range label="Extra detail in busy areas" min={0} max={100} value={settings.adaptive} display={`${settings.adaptive}%`} onChange={(value) => updateSettings('adaptive', value)} />
              )}
              {USES_JITTER.includes(settings.pattern) && (
                <Range label={settings.pattern === 'engrave' ? 'Wave' : 'Hand-cut'} min={0} max={100} value={settings.jitter} display={`${settings.jitter}%`} onChange={(value) => updateSettings('jitter', value)} />
              )}
              {LINE_LABEL[settings.pattern] && (
                <Range label={LINE_LABEL[settings.pattern]!} min={0} max={8} step={0.5} value={settings.lineWeight} display={settings.lineWeight ? `${settings.lineWeight}` : 'Off'} onChange={(value) => updateSettings('lineWeight', value)} />
              )}
              {USES_SEED.includes(settings.pattern) && (
                <button type="button" className="text-button" onClick={() => updateSettings('seed', Math.floor(Math.random() * 1e6))}>
                  <Shuffle size={12} /> Re-cut the shapes
                </button>
              )}
            </div>
          )}

          {style !== 'animated' && (
            <div className="art-control-group">
              <Toggle checked={settings.vignette} onChange={(value) => updateSettings('vignette', value)} label="Vignette" />
            </div>
          )}

          {style === 'animated' && (
            <div className="art-control-group">
              <div className="segmented art-segmented">
                {(Object.keys(MODE_LABELS) as AnimationMode[]).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    className={settings.animMode === mode ? 'is-active' : ''}
                    onClick={() => updateSettings('animMode', mode)}
                  >
                    {MODE_LABELS[mode]}
                  </button>
                ))}
              </div>
              <p className="art-mode-note">{GIF_MODES[settings.animMode]}</p>
              <Range
                label="Speed"
                min={1}
                max={8}
                value={settings.animSpeed}
                display={`${settings.animSpeed}×`}
                onChange={(value) => updateSettings('animSpeed', value)}
              />
              <Range
                label="Atmosphere"
                min={10}
                max={100}
                value={settings.animIntensity}
                display={`${settings.animIntensity}%`}
                onChange={(value) => updateSettings('animIntensity', value)}
              />
              <div className="gif-spec">
                <span>GIF</span>
                <span>18 frames</span>
                <span>10 fps</span>
                <span>Loop</span>
              </div>
            </div>
          )}

          {style !== 'animated' && (
            <div className="art-control-group">
              <FramePicker title="Picture frame" value={frameV} onChange={(p) => setFrameV((v) => ({ ...v, ...p }))} />
            </div>
          )}

        </aside>

        <section className="art-stage">
          <div className="art-stage-top">
            <div>
              <span className="eyebrow">Output / {STYLE_META[style].short}</span>
              <strong>{source.name}</strong>
            </div>
            <div className="art-stage-meta">
              <span>{STYLE_META[style].label}</span>
              {style === 'animated' ? (
                <button
                  type="button"
                  className="stage-play"
                  onClick={() => setPlaying((value) => !value)}
                >
                  {playing ? <Pause size={13} /> : <Play size={13} />}
                  {playing ? 'Pause' : 'Play'}
                </button>
              ) : (
                <span>Full resolution export</span>
              )}
            </div>
          </div>

          <div className="art-canvas-board">
            <span className="board-corner tl" />
            <span className="board-corner tr" />
            <span className="board-corner bl" />
            <span className="board-corner br" />
            <div className="art-canvas-shell" style={{ aspectRatio: `${style === 'animated' ? aspect : shellAspect}` }}>
              {imageError ? (
                <div className="preview-error">This frame could not be opened.</div>
              ) : (
                <canvas ref={canvasRef} className="art-canvas" />
              )}
              {busy && (
                <div className="render-overlay">
                  <Spinner />
                  <span>
                    {style === 'animated'
                      ? `Encoding loop · ${Math.round(progress * 100)}%`
                      : 'Rendering art study…'}
                  </span>
                  <div className="render-progress">
                    <span style={{ width: `${Math.round(progress * 100)}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="board-label">
              <span>DELINEATE ART LAB</span>
              <span>{style === 'animated' ? 'LIVE LOOP' : 'STILL STUDY'}</span>
              <span>LOCAL RENDER</span>
            </div>
          </div>

          <div className="art-stage-foot">
            <span>
              Source: {source.width} × {source.height}
            </span>
            <span>Original untouched</span>
            <span>{style === 'animated' ? 'Exports as animated GIF' : 'Exports as lossless PNG'}</span>
          </div>
        </section>

      </div>
    </div>
  );
}
