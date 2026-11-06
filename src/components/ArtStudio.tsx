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
  Save,
  Shapes,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { FrameStyle, PhotoRecord } from '../types';
import { applyFrame, FRAME_STYLES } from '../lib/frames';
import {
  DEFAULT_ART,
  PALETTES,
  encodeAnimation,
  renderAnimatedFrame,
  renderArtStill,
  type AnimationMode,
  type ArtSettings,
  type ArtStyle,
  type GeometricPattern,
  type PaletteKey,
} from '../lib/art';
import {
  canvasToBlob,
  downloadBlob,
  fileSlug,
  loadImage,
  pad,
  uid,
} from '../lib/utils';
import { Modal, Range, Spinner, Toggle, useObjectUrl } from './ui';

type ArtStudioProps = {
  photos: PhotoRecord[];
  source: PhotoRecord | null;
  onSource: (record: PhotoRecord) => void;
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

const PATTERN_LABELS: Record<GeometricPattern, string> = {
  triangles: 'Facets',
  mosaic: 'Mosaic',
  orbs: 'Orbs',
};

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

function SourceThumb({ photo, onClick }: { photo: PhotoRecord; onClick: () => void }) {
  const url = useObjectUrl(photo.blob);
  return (
    <button type="button" className="source-thumb" onClick={onClick} title={photo.name}>
      {url && <img src={url} alt="" />}
      <span>{photo.name}</span>
    </button>
  );
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
  const [frame, setFrame] = useState<FrameStyle>('none');
  const [shellAspect, setShellAspect] = useState(1);
  const [settings, setSettings] = useState<ArtSettings>({ ...DEFAULT_ART });
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [busy, setBusy] = useState<'save' | 'download' | null>(null);
  const [progress, setProgress] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sourceUrl = useObjectUrl(source?.blob);
  const sourcePhotos = photos.slice(0, 8);
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

    const rendered = applyFrame(renderArtStill(image, style, settings, previewLongSide), frame);
    canvas.width = rendered.width;
    canvas.height = rendered.height;
    setShellAspect(rendered.width / rendered.height);
    context.drawImage(rendered, 0, 0);
    return undefined;
  }, [image, style, settings, aspect, playing, frame]);

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
    const canvas = applyFrame(renderArtStill(image, style, settings, 1800), frame);
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
    setPickerOpen(false);
  };

  if (!source) {
    return (
      <div className="art-page page-enter">
        <div className="page-kicker-row">
          <div className="page-kicker">
            <span className="eyebrow">Art Lab / 07</span>
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
              {photos.length > 0 && (
                <button className="button button-outline" type="button" onClick={() => setPickerOpen(true)}>
                  Browse the archive
                </button>
              )}
            </div>
          </div>
          <div className="art-empty-visual" aria-hidden="true">
            <span className="art-orbit one" />
            <span className="art-orbit two" />
            <span className="art-orbit three" />
            <span className="art-visual-core">
              <Sparkles size={38} strokeWidth={1} />
            </span>
            <span className="art-visual-tag">PIXEL / SWIRL / FACET / LOOP</span>
          </div>
        </section>

        {photos.length > 0 ? (
          <section className="art-source-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">The contact sheet</span>
                <h3>Choose a frame to transform</h3>
              </div>
              <button className="text-button" type="button" onClick={() => setPickerOpen(true)}>
                View all {photos.length} frames
              </button>
            </div>
            <div className="art-source-grid">
              {sourcePhotos.map((photo) => (
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

        {pickerOpen && (
          <Modal title="Pick a source frame" eyebrow="Art Lab / Source" wide onClose={() => setPickerOpen(false)}>
            <div className="source-picker-grid">
              {photos.map((photo) => (
                <PickerCard key={photo.id} photo={photo} onPick={() => chooseSource(photo)} />
              ))}
            </div>
          </Modal>
        )}
      </div>
    );
  }

  return (
    <div className="art-page page-enter">
      <div className="page-kicker-row">
        <div className="page-kicker">
          <span className="eyebrow">Art Lab / 07</span>
          <p>Turn a memory into something stranger.</p>
        </div>
        <div className="privacy-pill">
          <Sparkles size={12} />
          Generated locally · Save or download
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
              <div className="palette-grid">
                {(Object.keys(PALETTES) as PaletteKey[]).map((key) => {
                  const palette = PALETTES[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      className={`palette-chip ${settings.palette === key ? 'is-active' : ''}`}
                      onClick={() => updateSettings('palette', key)}
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
            </div>
          )}

          {style === 'abstract' && (
            <div className="art-control-group">
              <Range
                label="Swirl intensity"
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
              <Range
                label="Cell size"
                min={14}
                max={80}
                value={settings.cellSize}
                display={`${settings.cellSize}px`}
                onChange={(value) => updateSettings('cellSize', value)}
              />
              <div className="segmented art-segmented">
                {(Object.keys(PATTERN_LABELS) as GeometricPattern[]).map((pattern) => (
                  <button
                    key={pattern}
                    type="button"
                    className={settings.pattern === pattern ? 'is-active' : ''}
                    onClick={() => updateSettings('pattern', pattern)}
                  >
                    {PATTERN_LABELS[pattern]}
                  </button>
                ))}
              </div>
              <Toggle
                checked={settings.outlines}
                onChange={(value) => updateSettings('outlines', value)}
                label="Facet outlines"
              />
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
              <span className="eyebrow">Picture frame</span>
              <div className="pr-frames">
                {FRAME_STYLES.map((f) => (
                  <button key={f.id} type="button" className={frame === f.id ? 'is-active' : ''} onClick={() => setFrame(f.id)} title={f.label}>
                    <span style={{ background: f.swatch }} />
                    <small>{f.label}</small>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="art-action-stack">
            <button
              className="button button-dark button-full"
              type="button"
              onClick={() => void save()}
              disabled={!image || busy !== null}
            >
              {busy === 'save' ? <Spinner /> : <Save size={15} />}
              {busy === 'save' ? 'Rendering…' : style === 'animated' ? 'Save GIF to archive' : 'Save art to archive'}
            </button>
            <button
              className="button button-outline button-full"
              type="button"
              onClick={() => void download()}
              disabled={!image || busy !== null}
            >
              {busy === 'download' ? <Spinner /> : <Download size={15} />}
              {busy === 'download' ? 'Rendering…' : style === 'animated' ? 'Download GIF' : 'Download PNG'}
            </button>
          </div>
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

        <aside className="art-source-rail">
          <div className="source-rail-head">
            <span className="eyebrow">Source frame</span>
            <button className="text-button" type="button" onClick={() => setPickerOpen(true)}>
              Change
            </button>
          </div>
          <div className="source-preview">
            {sourceUrl && <img src={sourceUrl} alt={source.name} />}
            <span className="source-preview-label">SOURCE</span>
          </div>
          <strong className="source-preview-name">{source.name}</strong>
          <span className="source-preview-note">{source.filterName}</span>

          <div className="source-divider" />
          <span className="eyebrow">More frames</span>
          <div className="source-thumb-list">
            {sourcePhotos
              .filter((photo) => photo.id !== source.id)
              .slice(0, 5)
              .map((photo) => (
                <SourceThumb key={photo.id} photo={photo} onClick={() => chooseSource(photo)} />
              ))}
          </div>
          <button className="button button-outline button-full" type="button" onClick={onImport}>
            <ImagePlus size={14} /> Import another
          </button>

          <div className="source-divider" />
          <div className="studio-note">
            <Sparkles size={15} />
            <p>
              Every result is a new file. Experiment freely — your source frame and its filter stay
              exactly as they were.
            </p>
          </div>
        </aside>
      </div>

      {pickerOpen && (
        <Modal title="Pick a source frame" eyebrow="Art Lab / Source" wide onClose={() => setPickerOpen(false)}>
          <div className="source-picker-grid">
            {photos.map((photo) => (
              <PickerCard key={photo.id} photo={photo} onPick={() => chooseSource(photo)} />
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
