import type { Look } from '../types';
import { warmthColor, tintColor, lookToCss } from './filters';
import { clamp } from './utils';

type RenderOptions = {
  rotate?: number;
  flipH?: boolean;
  mirror?: boolean;
};

let noiseCanvas: HTMLCanvasElement | null = null;

function getNoiseCanvas() {
  if (noiseCanvas) return noiseCanvas;
  const canvas = document.createElement('canvas');
  canvas.width = 180;
  canvas.height = 180;
  const context = canvas.getContext('2d')!;
  const data = context.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < data.data.length; i += 4) {
    const tone = 65 + Math.floor(Math.random() * 128);
    data.data[i] = tone;
    data.data[i + 1] = tone;
    data.data[i + 2] = tone;
    data.data[i + 3] = 255;
  }
  context.putImageData(data, 0, 0);
  noiseCanvas = canvas;
  return canvas;
}

export const NOISE_TEXTURE = `url("data:image/svg+xml,%3Csvg viewBox='0 0 180 180' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.8'/%3E%3C/svg%3E")`;

function createOrientedSource(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  options: RenderOptions,
) {
  const rotate = ((options.rotate ?? 0) % 360 + 360) % 360;
  const quarterTurn = rotate === 90 || rotate === 270;
  const width = quarterTurn ? sourceHeight : sourceWidth;
  const height = quarterTurn ? sourceWidth : sourceHeight;
  const stage = document.createElement('canvas');
  stage.width = width;
  stage.height = height;
  const context = stage.getContext('2d')!;

  context.save();
  if (rotate === 90) {
    context.translate(width, 0);
    context.rotate(Math.PI / 2);
  } else if (rotate === 180) {
    context.translate(width, height);
    context.rotate(Math.PI);
  } else if (rotate === 270) {
    context.translate(0, height);
    context.rotate(-Math.PI / 2);
  }
  context.drawImage(source, 0, 0, sourceWidth, sourceHeight);
  context.restore();

  const shouldMirror = Boolean(options.flipH) !== Boolean(options.mirror);
  if (!shouldMirror) return stage;

  const mirrored = document.createElement('canvas');
  mirrored.width = width;
  mirrored.height = height;
  const mirrorContext = mirrored.getContext('2d')!;
  mirrorContext.translate(width, 0);
  mirrorContext.scale(-1, 1);
  mirrorContext.drawImage(stage, 0, 0);
  return mirrored;
}

function paintOverlays(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  look: Look,
) {
  if (look.tone && look.toneAmount > 0) {
    context.save();
    context.globalCompositeOperation = 'color';
    context.globalAlpha = clamp(look.toneAmount, 0, 1);
    context.fillStyle = look.tone;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  if (look.warmth !== 0) {
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.fillStyle = warmthColor(look.warmth);
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  if (look.tint !== 0) {
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.fillStyle = tintColor(look.tint);
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  if (look.fade > 0) {
    context.save();
    context.globalCompositeOperation = 'screen';
    context.fillStyle = `rgba(246, 234, 210, ${clamp(look.fade, 0, 1) * 0.46})`;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  if (look.lightLeak > 0) {
    const alpha = clamp(look.lightLeak, 0, 1);
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, `rgba(255, 177, 92, ${alpha * 0.78})`);
    gradient.addColorStop(0.3, `rgba(255, 104, 71, ${alpha * 0.5})`);
    gradient.addColorStop(0.58, 'rgba(255, 220, 160, 0)');
    gradient.addColorStop(1, `rgba(255, 213, 142, ${alpha * 0.4})`);
    context.save();
    context.globalCompositeOperation = 'screen';
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  if (look.scanlines > 0) {
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = `rgba(18, 20, 16, ${clamp(look.scanlines, 0, 1) * 0.42})`;
    for (let y = 0; y < height; y += 3) {
      context.fillRect(0, y, width, 1);
    }
    context.restore();
  }

  if (look.grain > 0) {
    const pattern = context.createPattern(getNoiseCanvas(), 'repeat');
    if (pattern) {
      context.save();
      context.globalCompositeOperation = 'overlay';
      context.globalAlpha = clamp(look.grain / 100, 0, 1) * 0.52;
      context.fillStyle = pattern;
      context.fillRect(0, 0, width, height);
      context.restore();
    }
  }

  if (look.vignette > 0) {
    const amount = clamp(look.vignette, 0, 1);
    const gradient = context.createRadialGradient(
      width / 2,
      height / 2,
      Math.min(width, height) * 0.2,
      width / 2,
      height / 2,
      Math.max(width, height) * 0.72,
    );
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
    gradient.addColorStop(0.56, `rgba(8, 8, 6, ${amount * 0.12})`);
    gradient.addColorStop(1, `rgba(8, 8, 6, ${amount * 0.82})`);
    context.save();
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
  }
}

export function renderFrame(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  look: Look,
  options: RenderOptions = {},
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';

  const oriented = createOrientedSource(source, sourceWidth, sourceHeight, options);
  const scale = Math.max(width / oriented.width, height / oriented.height);
  const drawWidth = oriented.width * scale;
  const drawHeight = oriented.height * scale;
  const offsetX = (width - drawWidth) / 2;
  const offsetY = (height - drawHeight) / 2;

  context.save();
  context.filter = lookToCss(look);
  context.drawImage(oriented, offsetX, offsetY, drawWidth, drawHeight);
  context.restore();

  paintOverlays(context, width, height, look);
  return canvas;
}

export function overlayLayers(look: Look) {
  return {
    tone: look.tone
      ? { backgroundColor: look.tone, opacity: look.toneAmount, mixBlendMode: 'color' as const }
      : null,
    warmth:
      look.warmth !== 0
        ? {
            backgroundColor: warmthColor(look.warmth),
            mixBlendMode: 'soft-light' as const,
          }
        : null,
    tint:
      look.tint !== 0
        ? { backgroundColor: tintColor(look.tint), mixBlendMode: 'soft-light' as const }
        : null,
    fade:
      look.fade > 0
        ? {
            backgroundColor: `rgba(246, 234, 210, ${clamp(look.fade, 0, 1) * 0.46})`,
            mixBlendMode: 'screen' as const,
          }
        : null,
    lightLeak:
      look.lightLeak > 0
        ? {
            backgroundImage: `linear-gradient(135deg, rgba(255,177,92,${
              look.lightLeak * 0.78
            }), rgba(255,104,71,${look.lightLeak * 0.5}) 30%, transparent 58%, rgba(255,213,142,${
              look.lightLeak * 0.4
            }))`,
            mixBlendMode: 'screen' as const,
          }
        : null,
    scanlines:
      look.scanlines > 0
        ? {
            backgroundImage: `repeating-linear-gradient(to bottom, rgba(18,20,16,${
              look.scanlines * 0.42
            }) 0px, rgba(18,20,16,${look.scanlines * 0.42}) 1px, transparent 1px, transparent 3px)`,
            mixBlendMode: 'multiply' as const,
          }
        : null,
    grain:
      look.grain > 0
        ? {
            backgroundImage: NOISE_TEXTURE,
            backgroundSize: '180px 180px',
            opacity: clamp(look.grain / 100, 0, 1) * 0.52,
            mixBlendMode: 'overlay' as const,
          }
        : null,
    vignette:
      look.vignette > 0
        ? {
            background: `radial-gradient(ellipse at center, transparent 20%, rgba(8,8,6,${
              look.vignette * 0.12
            }) 56%, rgba(8,8,6,${look.vignette * 0.82}) 100%)`,
          }
        : null,
  };
}
