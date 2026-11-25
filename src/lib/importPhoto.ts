import type { PhotoRecord } from '../types';
import { readExif } from './exif';
import { canvasToBlob, uid } from './utils';

/** An archive record for a picture from the device, dated and placed from its EXIF when the file has it. */
export async function importedRecord(file: File, img: HTMLImageElement): Promise<PhotoRecord> {
  const exif = await readExif(file).catch(() => ({}) as Awaited<ReturnType<typeof readExif>>);
  // a huge photo is kept whole for downloads and backups, and worked on through a 4096 px copy
  let working: Blob = file;
  if (img.dataset.full) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    working = await canvasToBlob(c, 'image/jpeg', 0.92);
  }
  return {
    ...(img.dataset.full && { fullRes: file, fullSize: img.dataset.full }),
    id: uid(),
    name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported photo',
    createdAt: exif.taken ?? Date.now(),
    blob: working,
    mime: working.type || file.type,
    width: img.naturalWidth,
    height: img.naturalHeight,
    filterName: 'Imported',
    kind: 'still',
    developed: true,
    note: 'Imported from your device',
    place: exif.place,
  };
}
