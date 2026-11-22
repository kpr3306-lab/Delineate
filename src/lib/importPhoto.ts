import type { PhotoRecord } from '../types';
import { readExif } from './exif';
import { uid } from './utils';

/** An archive record for a picture from the device, dated and placed from its EXIF when the file has it. */
export async function importedRecord(file: File, img: HTMLImageElement): Promise<PhotoRecord> {
  const exif = await readExif(file).catch(() => ({}) as Awaited<ReturnType<typeof readExif>>);
  return {
    id: uid(),
    name: file.name.replace(/\.[^.]+$/, '').slice(0, 40) || 'Imported photo',
    createdAt: exif.taken ?? Date.now(),
    blob: file,
    mime: file.type,
    width: img.naturalWidth,
    height: img.naturalHeight,
    filterName: 'Imported',
    kind: 'still',
    developed: true,
    note: 'Imported from your device',
    place: exif.place,
  };
}
