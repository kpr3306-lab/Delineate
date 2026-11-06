import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import { clamp } from './utils';

export type ArtStyle = 'pixel' | 'abstract' | 'geometric' | 'animated';
export type PaletteKey = 'sunset' | 'acid' | 'ice' | 'mono' | 'celluloid';
export type GeometricPattern = 'triangles' | 'mosaic' | 'orbs';
export type AnimationMode = 'drift' | 'vhs' | 'pulse';

export type ArtSettings = {
  palette: PaletteKey;
  pixelSize: number;
  colorCount: number;
  dither: boolean;
  abstractIntensity: number;
  cellSize: number;
  pattern: GeometricPattern;
  outlines: boolean;
  animMode: AnimationMode;
  animSpeed: number;
  animIntensity: number;
};

export const DEFAULT_ART: ArtSettings = {
  palette: 'sunset',
  pixelSize: 9,
  colorCount: 12,
  dither: true,
  abstractIntensity: 6,
  cellSize: 34,
  pattern: 'triangles',
  outlines: true,
  animMode: 'drift',
  animSpeed: 3,
  animIntensity: 55,
};

export const PALETTES: Record<
  PaletteKey,
  { name: string; stops: string[]; dark: string; light: string }
> = {
  sunset: {
    name: 'Sunset',
    stops: ['#160f2e', '#4e2350', '#b53f4d', '#ef9b5b', '#ffedb5'],
    dark: '#160f2e',
    light: '#ffedb5',
  },
  acid: {
    name: 'Acid',
    stops: ['#101b12', '#294b28', '#7b9f45', '#d8e77b', '#f6ffcf'],
    dark: '#101b12',
    light: '#f6ffcf',
  },
  ice: {
    name: 'Ice',
    stops: ['#08131f', '#173552', '#2f7593', '#8fc9c4', '#f1fcfa'],
    dark: '#08131f',
    light: '#f1fcfa',
  },
  mono: {
    name: 'Graphite',
    stops: ['#080808', '#303030', '#77736c', '#c7c1b5', '#fffaf0'],
    dark: '#080808',
    light: '#fffaf0',
  },
  celluloid: {
    name: 'Celluloid',
    stops: ['#211a11', '#59422b', '#a76a3f', '#e2b46d', '#fff0c9'],
    dark: '#211a11',
    light: '#fff0c9',
  },
};

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const value = hex.replace('#', '');
  return [
    parseInt(value.slice(0, 2), 16),
    parseInt(value.slice(2, 4), 16),
    parseInt(value.slice(4, 6), 16),
  ];
}

const paletteCache = new Map<PaletteKey, RGB[]>();

function getPalette(key: PaletteKey) {
  const cached = paletteCache.get(key);
  if (cached) return cached;
  const parsed = PALETTES[key].stops.map(hexToRgb);
  paletteCache.set(key, parsed);
  return parsed;
}

function samplePalette(stops: RGB[], t: number): RGB {
  const scaled = clamp(t, 0, 1) * (stops.length - 1);
  const index = Math.min(stops.length - 2, Math.floor(scaled));
  const mix = scaled - index;
  const a = stops[index];
  const b = stops[index + 1];
  return [
    Math.round(a[0] + (b[0] - a[0]) * mix),
    Math.round(a[1] + (b[1] - a[1]) * mix),
    Math.round(a[2] + (b[2] - a[2]) * mix),
  ];
}

function drawCover(
  context: CanvasRenderingContext2D,
  image: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number,
  width: number,
  height: number,
  zoom = 1,
  panX = 0,
  panY = 0,
) {
  const scale = Math.max(width / sourceWidth, height / sourceHeight) * zoom;
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  context.drawImage(
    image,
    (width - drawWidth) / 2 + panX,
    (height - drawHeight) / 2 + panY,
    drawWidth,
    drawHeight,
  );
}

function sourceImageData(
  image: HTMLImageElement,
  width: number,
  height: number,
  smooth = true,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  context.imageSmoothingEnabled = smooth;
  context.imageSmoothingQuality = 'high';
  drawCover(
    context,
    image,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    width,
    height,
  );
  return { canvas, context, data: context.getImageData(0, 0, width, height) };
}

const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

function applyDither(data: ImageData, strength = 24) {
  const pixels = data.data;
  for (let y = 0; y < data.height; y += 1) {
    for (let x = 0; x < data.width; x += 1) {
      const offset = (y * data.width + x) * 4;
      const threshold = (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * strength;
      pixels[offset] = clamp(pixels[offset] + threshold, 0, 255);
      pixels[offset + 1] = clamp(pixels[offset + 1] + threshold, 0, 255);
      pixels[offset + 2] = clamp(pixels[offset + 2] + threshold, 0, 255);
    }
  }
}

function renderPixel(
  image: HTMLImageElement,
  width: number,
  height: number,
  settings: ArtSettings,
) {
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d')!;
  context.imageSmoothingEnabled = false;

  const smallWidth = Math.max(8, Math.round(width / settings.pixelSize));
  const smallHeight = Math.max(8, Math.round(height / settings.pixelSize));
  const { canvas: smallCanvas, data } = sourceImageData(
    image,
    smallWidth,
    smallHeight,
    true,
  );
  if (settings.dither) applyDither(data, 26);

  const palette = quantize(
    data.data,
    Math.max(4, Math.round(settings.colorCount)),
    { format: 'rgb444' },
  );
  const indexed = applyPalette(data.data, palette, 'rgb444');
  const indexedCanvas = document.createElement('canvas');
  indexedCanvas.width = smallWidth;
  indexedCanvas.height = smallHeight;
  const indexedContext = indexedCanvas.getContext('2d')!;
  const indexedData = indexedContext.createImageData(smallWidth, smallHeight);
  for (let i = 0; i < indexed.length; i += 1) {
    const color = palette[indexed[i]];
    const offset = i * 4;
    indexedData.data[offset] = color[0];
    indexedData.data[offset + 1] = color[1];
    indexedData.data[offset + 2] = color[2];
    indexedData.data[offset + 3] = 255;
  }
  indexedContext.putImageData(indexedData, 0, 0);
  context.drawImage(smallCanvas, 0, 0, smallWidth, smallHeight, 0, 0, width, height);
  context.drawImage(indexedCanvas, 0, 0, width, height);

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.3,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.72,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  return output;
}

function renderAbstract(
  image: HTMLImageElement,
  width: number,
  height: number,
  settings: ArtSettings,
) {
  const { data: source } = sourceImageData(image, width, height, true);
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d')!;
  const target = context.createImageData(width, height);
  const stops = getPalette(settings.palette);
  const intensity = settings.abstractIntensity / 10;
  const centerX = width / 2;
  const centerY = height / 2;
  const maxRadius = Math.hypot(centerX, centerY);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = x - centerX;
      const dy = y - centerY;
      const radius = Math.hypot(dx, dy);
      const normalized = radius / maxRadius;
      const angle = Math.atan2(dy, dx) + (1 - normalized) * intensity * 3.4;
      const wobble =
        1 + Math.sin(normalized * 11 + angle * 2.5) * intensity * 0.09;
      let sourceX = centerX + Math.cos(angle) * radius * wobble;
      let sourceY = centerY + Math.sin(angle) * radius * wobble;
      sourceX += Math.sin((y / height) * Math.PI * 4) * intensity * 20;
      sourceY += Math.cos((x / width) * Math.PI * 3) * intensity * 12;
      sourceX = clamp(sourceX, 0, width - 1);
      sourceY = clamp(sourceY, 0, height - 1);

      const sourceOffset =
        (Math.floor(sourceY) * width + Math.floor(sourceX)) * 4;
      const red = source.data[sourceOffset];
      const green = source.data[sourceOffset + 1];
      const blue = source.data[sourceOffset + 2];
      const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
      const colorWarp =
        Math.sin((x / width) * 5 + (y / height) * 4 + angle) * intensity * 0.08;
      const mapped = samplePalette(stops, luminance * 0.92 + colorWarp + 0.04);

      const targetOffset = (y * width + x) * 4;
      target.data[targetOffset] = mapped[0];
      target.data[targetOffset + 1] = mapped[1];
      target.data[targetOffset + 2] = mapped[2];
      target.data[targetOffset + 3] = 255;
    }
  }
  context.putImageData(target, 0, 0);

  if (settings.outlines) {
    context.save();
    context.globalCompositeOperation = 'multiply';
    context.fillStyle = 'rgba(20, 14, 22, 0.12)';
    for (let y = 0; y < height; y += 5) {
      const wave = Math.sin(y * 0.03) * 8;
      context.fillRect(0, y + wave, width, 1);
    }
    context.restore();
  }
  return output;
}

function renderGeometric(
  image: HTMLImageElement,
  width: number,
  height: number,
  settings: ArtSettings,
) {
  const output = document.createElement('canvas');
  output.width = width;
  output.height = height;
  const context = output.getContext('2d')!;
  const { data: source } = sourceImageData(image, width, height, true);
  const paletteInfo = PALETTES[settings.palette];
  const stops = getPalette(settings.palette);
  context.fillStyle = paletteInfo.dark;
  context.fillRect(0, 0, width, height);

  const cell = Math.max(14, settings.cellSize);
  const columns = Math.ceil(width / cell);
  const rows = Math.ceil(height / cell);
  context.lineJoin = 'round';

  const pixelColor = (x: number, y: number, shift = 0) => {
    const px = Math.floor(clamp(x, 0, width - 1));
    const py = Math.floor(clamp(y, 0, height - 1));
    const offset = (py * width + px) * 4;
    const red = source.data[offset];
    const green = source.data[offset + 1];
    const blue = source.data[offset + 2];
    const luminance = (red * 0.2126 + green * 0.7152 + blue * 0.0722) / 255;
    return samplePalette(stops, clamp(luminance + shift, 0, 1));
  };

  const colorString = (color: RGB, alpha = 1) =>
    `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${alpha})`;

  if (settings.pattern === 'triangles') {
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * cell;
        const y = row * cell;
        const split = (row + column) % 2 === 0;
        const first = pixelColor(x + cell * 0.32, y + cell * 0.32, 0.02);
        const second = pixelColor(x + cell * 0.78, y + cell * 0.78, -0.02);
        context.beginPath();
        if (split) {
          context.moveTo(x, y);
          context.lineTo(x + cell, y);
          context.lineTo(x, y + cell);
        } else {
          context.moveTo(x + cell, y);
          context.lineTo(x + cell, y + cell);
          context.lineTo(x, y);
        }
        context.closePath();
        context.fillStyle = colorString(first);
        context.fill();
        if (settings.outlines) {
          context.strokeStyle = colorString(pixelColor(x + cell * 0.5, y + cell * 0.5, -0.08), 0.55);
          context.lineWidth = 1;
          context.stroke();
        }

        context.beginPath();
        if (split) {
          context.moveTo(x + cell, y);
          context.lineTo(x + cell, y + cell);
          context.lineTo(x, y + cell);
        } else {
          context.moveTo(x, y);
          context.lineTo(x + cell, y + cell);
          context.lineTo(x, y + cell);
        }
        context.closePath();
        context.fillStyle = colorString(second);
        context.fill();
        if (settings.outlines) {
          context.strokeStyle = colorString(pixelColor(x + cell * 0.5, y + cell * 0.5, 0.06), 0.55);
          context.stroke();
        }
      }
    }
  } else if (settings.pattern === 'mosaic') {
    let seed = 7;
    const random = () => {
      seed = (seed * 1103515245 + 12345) % 2147483647;
      return seed / 2147483647;
    };
    for (let row = -1; row < rows + 1; row += 1) {
      for (let column = -1; column < columns + 1; column += 1) {
        const x = column * cell;
        const y = row * cell;
        const jitter = cell * 0.24;
        const color = pixelColor(x + cell / 2, y + cell / 2, (random() - 0.5) * 0.08);
        context.beginPath();
        context.moveTo(x + (random() - 0.5) * jitter, y + (random() - 0.5) * jitter);
        context.lineTo(
          x + cell + (random() - 0.5) * jitter,
          y + (random() - 0.5) * jitter,
        );
        context.lineTo(
          x + cell + (random() - 0.5) * jitter,
          y + cell + (random() - 0.5) * jitter,
        );
        context.lineTo(x + (random() - 0.5) * jitter, y + cell + (random() - 0.5) * jitter);
        context.closePath();
        context.fillStyle = colorString(color);
        context.fill();
        if (settings.outlines) {
          context.strokeStyle = colorString(pixelColor(x + cell / 2, y + cell / 2, 0.1), 0.45);
          context.lineWidth = 1.4;
          context.stroke();
        }
      }
    }
  } else {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, paletteInfo.dark);
    gradient.addColorStop(1, paletteInfo.stops[1]);
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    let seed = 19;
    const random = () => {
      seed = (seed * 48271) % 2147483647;
      return seed / 2147483647;
    };
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const x = column * cell + cell / 2;
        const y = row * cell + cell / 2;
        const radius = cell * (0.22 + random() * 0.5);
        const color = pixelColor(x, y, (random() - 0.5) * 0.2);
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fillStyle = colorString(color, 0.92);
        context.fill();
        if (settings.outlines) {
          context.strokeStyle = 'rgba(246, 238, 218, 0.22)';
          context.lineWidth = 1;
          context.stroke();
        }
      }
    }
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.fillStyle = paletteInfo.light;
    context.globalAlpha = 0.12;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.3,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.7,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.25)');
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  return output;
}

export function renderAnimatedFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  width: number,
  height: number,
  settings: ArtSettings,
  time: number,
) {
  const paletteInfo = PALETTES[settings.palette];
  const stops = getPalette(settings.palette);
  const intensity = settings.animIntensity / 100;
  const speed = settings.animSpeed;
  context.clearRect(0, 0, width, height);
  context.fillStyle = paletteInfo.dark;
  context.fillRect(0, 0, width, height);

  const zoom = 1.04 + Math.sin(time * speed * 0.7) * 0.018;
  const panX = Math.sin(time * speed * 0.53) * width * 0.012;
  const panY = Math.cos(time * speed * 0.4) * height * 0.009;
  context.save();
  context.beginPath();
  context.rect(0, 0, width, height);
  context.clip();
  drawCover(
    context,
    image,
    image.naturalWidth || image.width,
    image.naturalHeight || image.height,
    width,
    height,
    zoom,
    panX,
    panY,
  );

  if (settings.animMode === 'vhs') {
    const shift = Math.sin(time * speed * 2.1) * 2 + 2;
    context.save();
    context.globalCompositeOperation = 'screen';
    context.globalAlpha = 0.15;
    context.filter = 'hue-rotate(24deg) saturate(2.2)';
    context.translate(shift, 0);
    drawCover(
      context,
      image,
      image.naturalWidth || image.width,
      image.naturalHeight || image.height,
      width,
      height,
      zoom,
      panX,
      panY,
    );
    context.filter = 'none';
    context.restore();
  }

  if (settings.animMode === 'pulse') {
    const pulse = 0.5 + Math.sin(time * speed * 1.8) * 0.5;
    const gradient = context.createLinearGradient(0, 0, width, height);
    const accent = samplePalette(stops, 0.62 + pulse * 0.2);
    gradient.addColorStop(0, `rgba(${accent[0]}, ${accent[1]}, ${accent[2]}, ${0.12 + pulse * 0.14 * intensity})`);
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  const leak = context.createLinearGradient(0, 0, width, height);
  const leakAlpha = (0.05 + Math.sin(time * speed * 0.9) * 0.04) * intensity;
  leak.addColorStop(0, `rgba(255, 170, 80, ${leakAlpha})`);
  leak.addColorStop(0.4, `rgba(255, 93, 65, ${leakAlpha * 0.3})`);
  leak.addColorStop(1, 'rgba(0,0,0,0)');
  context.save();
  context.globalCompositeOperation = 'screen';
  context.fillStyle = leak;
  context.fillRect(0, 0, width, height);
  context.restore();

  if (settings.animMode === 'vhs') {
    const bandY = ((time * 0.18) % 1.35 - 0.15) * height;
    const band = context.createLinearGradient(0, bandY - height * 0.08, 0, bandY + height * 0.08);
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.5, `rgba(246, 238, 218, ${0.16 * intensity})`);
    band.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = band;
    context.fillRect(0, bandY - height * 0.08, width, height * 0.16);
    context.fillStyle = `rgba(8, 8, 10, ${0.35 * intensity})`;
    for (let y = 0; y < height; y += 4) {
      context.fillRect(0, y, width, 1);
    }
  }

  const scan = 0.05 * intensity;
  context.fillStyle = `rgba(10, 12, 10, ${scan})`;
  for (let y = 0; y < height; y += 3) {
    context.fillRect(0, y, width, 1);
  }

  const noise = document.createElement('canvas');
  noise.width = 160;
  noise.height = 160;
  const noiseContext = noise.getContext('2d')!;
  const noiseData = noiseContext.createImageData(160, 160);
  const seed = Math.floor(time * 10) * 7;
  for (let i = 0; i < noiseData.data.length; i += 4) {
    const value = 70 + Math.floor(((Math.sin(i + seed) + 1) / 2) * 140);
    noiseData.data[i] = value;
    noiseData.data[i + 1] = value;
    noiseData.data[i + 2] = value;
    noiseData.data[i + 3] = 255;
  }
  noiseContext.putImageData(noiseData, 0, 0);
  const pattern = context.createPattern(noise, 'repeat');
  if (pattern) {
    context.save();
    context.globalCompositeOperation = 'overlay';
    context.globalAlpha = 0.14 * (0.5 + intensity);
    context.fillStyle = pattern;
    context.fillRect(0, 0, width, height);
    context.restore();
  }

  const vignette = context.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.25,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.75,
  );
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, `rgba(0,0,0,${0.35 + intensity * 0.1})`);
  context.fillStyle = vignette;
  context.fillRect(0, 0, width, height);
  context.restore();

  const frame = context.createLinearGradient(0, 0, 0, height);
  frame.addColorStop(0, 'rgba(255, 244, 222, 0.06)');
  frame.addColorStop(0.5, 'rgba(0,0,0,0)');
  frame.addColorStop(1, 'rgba(10, 8, 5, 0.16)');
  context.fillStyle = frame;
  context.fillRect(0, 0, width, height);
}

export function renderArtStill(
  image: HTMLImageElement,
  style: Exclude<ArtStyle, 'animated'>,
  settings: ArtSettings,
  longSide = 1400,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const aspect = sourceWidth / sourceHeight;
  const width = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const height = aspect >= 1 ? Math.round(longSide / aspect) : longSide;

  if (style === 'pixel') return renderPixel(image, width, height, settings);
  if (style === 'abstract') return renderAbstract(image, width, height, settings);
  return renderGeometric(image, width, height, settings);
}

export function renderAnimationStill(
  image: HTMLImageElement,
  settings: ArtSettings,
  longSide = 1400,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const aspect = sourceWidth / sourceHeight;
  const width = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const height = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  renderAnimatedFrame(context, image, width, height, settings, 1.2);
  return canvas;
}

export async function encodeAnimation(
  image: HTMLImageElement,
  settings: ArtSettings,
  onProgress?: (progress: number) => void,
) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  const aspect = sourceWidth / sourceHeight;
  const longSide = 520;
  const width = aspect >= 1 ? longSide : Math.round(longSide * aspect);
  const height = aspect >= 1 ? Math.round(longSide / aspect) : longSide;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  const gif = GIFEncoder();
  const frameCount = 18;

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = (frame / frameCount) * 5.4;
    renderAnimatedFrame(context, image, width, height, settings, time);
    const imageData = context.getImageData(0, 0, width, height).data;
    const palette = quantize(imageData, 128, { format: 'rgb444' });
    const indexed = applyPalette(imageData, palette, 'rgb444');
    gif.writeFrame(indexed, width, height, {
      palette,
      delay: 90,
      repeat: 0,
    });
    onProgress?.((frame + 1) / frameCount);
    await new Promise((resolve) => window.setTimeout(resolve, 0));
  }

  gif.finish();
  return new Blob([gif.bytes()], { type: 'image/gif' });
}
