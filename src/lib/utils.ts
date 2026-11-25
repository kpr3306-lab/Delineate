export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const formatDate = (timestamp: number) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
  }).format(new Date(timestamp));

export const formatTime = (timestamp: number) =>
  new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(timestamp));

export const pad = (value: number, size = 2) => String(value).padStart(size, '0');

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/jpeg',
  quality = 0.92,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Could not export the image.'));
      },
      type,
      quality,
    );
  });
}

/** Longest side of any image the app works on. Phone photos of 48–200 MP would otherwise exhaust an iPhone's memory. */
export const WORKING_MAX = 4096;

/**
 * Decode an image. Anything larger than WORKING_MAX on its long side comes back as a scaled working copy
 * (its true size noted in `dataset.full`, "W×H"), so no screen ever holds a 200 MP bitmap.
 */
export function loadImage(source: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof source === 'string' ? source : URL.createObjectURL(source);
    const image = new Image();
    image.onload = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      const long = Math.max(image.naturalWidth, image.naturalHeight);
      if (long <= WORKING_MAX) return resolve(image);
      const k = WORKING_MAX / long;
      const c = document.createElement('canvas');
      c.width = Math.round(image.naturalWidth * k);
      c.height = Math.round(image.naturalHeight * k);
      const ctx = c.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(image, 0, 0, c.width, c.height);
      const full = `${image.naturalWidth}×${image.naturalHeight}`;
      // let the huge decode go (handlers off first: clearing src fires an error event)
      image.onload = image.onerror = null;
      image.removeAttribute('src');
      c.toBlob(
        (blob) => {
          c.width = c.height = 0;
          if (!blob) return reject(new Error('Could not decode this image.'));
          loadImage(blob).then((small) => {
            small.dataset.full = full;
            resolve(small);
          }, reject);
        },
        'image/jpeg',
        0.92,
      );
    };
    image.onerror = () => {
      if (typeof source !== 'string') URL.revokeObjectURL(url);
      reject(new Error('Could not decode this image.'));
    };
    image.src = url;
  });
}

export function fileSlug(name: string) {
  return name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'delineate';
}

export function estimateDimensions(aspect: number, longSide = 1600) {
  if (aspect >= 1) {
    return { width: longSide, height: Math.round(longSide / aspect) };
  }
  return { width: Math.round(longSide * aspect), height: longSide };
}
