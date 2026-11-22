import JSZip from 'jszip';
import { STORES, getAll, putMany } from './db';
import { APP_VERSION } from './changelog';

/*
 * Backup format (a plain .zip you can open):
 *   manifest.json  { format: "delineate-backup", version: 1, app, createdAt, stores: {...}, media: [...], settings: {...} }
 *   media/<n>.<ext> every photo, original and journal image, referenced from the records as { "$blob": "media/<n>.<ext>" }
 * Restoring merges by id: nothing already on this device is deleted.
 */

const FORMAT = 'delineate-backup';
const VERSION = 1;
const SETTING_PREFIXES = ['delineate-', 'nostalgia-'];
type Store = (typeof STORES)[number];
type MediaRef = { $blob: string };
type MediaInfo = { path: string; type: string; size: number };
type Manifest = {
  format: string;
  version: number;
  app: string;
  createdAt: number;
  stores: Record<Store, unknown[]>;
  media: MediaInfo[];
  settings: Record<string, string>;
};

const extFor = (type: string) => (type.includes('png') ? 'png' : type.includes('gif') ? 'gif' : type.includes('webp') ? 'webp' : type.includes('pdf') ? 'pdf' : 'jpg');

/** Swap every Blob inside a record for a reference to a file in the zip. */
function pack(value: unknown, zip: JSZip, media: MediaInfo[]): unknown {
  if (value instanceof Blob) {
    const path = `media/${media.length + 1}.${extFor(value.type)}`;
    media.push({ path, type: value.type, size: value.size });
    zip.file(path, value);
    return { $blob: path } satisfies MediaRef;
  }
  if (Array.isArray(value)) return value.map((v) => pack(v, zip, media));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, pack(v, zip, media)]));
  return value;
}

export type BackupCounts = { photos: number; journals: number; recipes: number; collections: number; media: number; bytes: number };

export async function createBackup(onProgress?: (percent: number) => void): Promise<{ blob: Blob; counts: BackupCounts }> {
  const zip = new JSZip();
  const media: MediaInfo[] = [];
  const stores = {} as Record<Store, unknown[]>;
  for (const store of STORES) stores[store] = (await getAll<unknown>(store)).map((r) => pack(r, zip, media));
  const settings: Record<string, string> = {};
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && SETTING_PREFIXES.some((p) => key.startsWith(p))) settings[key] = window.localStorage.getItem(key) ?? '';
    }
  } catch {
    /* settings are optional */
  }
  const manifest: Manifest = { format: FORMAT, version: VERSION, app: APP_VERSION, createdAt: Date.now(), stores, media, settings };
  zip.file('manifest.json', JSON.stringify(manifest, null, 1));
  zip.file(
    'README.txt',
    'Delineate backup.\nmanifest.json lists every photo, journal, recipe, album, capsule and wall; media/ holds the image files.\nRestore it from Customise > Data in Delineate on any device.\n',
  );
  // images are already compressed: store them, only deflate the manifest
  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' }, (m) => onProgress?.(m.percent));
  return {
    blob,
    counts: {
      photos: stores.frames.length,
      journals: stores.journals.length,
      recipes: stores.presets.length,
      collections: stores.collections.length,
      media: media.length,
      bytes: blob.size,
    },
  };
}

export type RestorePlan = { counts: BackupCounts; createdAt: number; app: string; settings: number; apply: (withSettings: boolean) => Promise<void> };

/** Read and validate a backup file. Nothing is written until `apply` is called. */
export async function readBackup(file: File): Promise<RestorePlan> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('That file is not a Delineate backup (it is not a readable .zip).');
  }
  const raw = await zip.file('manifest.json')?.async('string');
  if (!raw) throw new Error('This .zip has no manifest.json, so it is not a Delineate backup.');
  let manifest: Manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    throw new Error('The backup manifest is damaged and cannot be read.');
  }
  if (manifest.format !== FORMAT) throw new Error('This .zip is not a Delineate backup.');
  if (manifest.version > VERSION) throw new Error('This backup was made by a newer Delineate. Update the app, then restore.');
  if (!manifest.stores || typeof manifest.stores !== 'object') throw new Error('The backup has no records in it.');
  const media = Array.isArray(manifest.media) ? manifest.media : [];
  // every referenced file must be present and the right size
  const blobs = new Map<string, Blob>();
  for (const info of media) {
    const entry = zip.file(info.path);
    if (!entry) throw new Error(`The backup is incomplete: ${info.path} is missing.`);
    const data = await entry.async('blob');
    if (data.size !== info.size) throw new Error(`The backup is damaged: ${info.path} is the wrong size.`);
    blobs.set(info.path, new Blob([data], { type: info.type }));
  }
  const unpack = (value: unknown): unknown => {
    if (value && typeof value === 'object' && !Array.isArray(value) && typeof (value as MediaRef).$blob === 'string') {
      const blob = blobs.get((value as MediaRef).$blob);
      if (!blob) throw new Error('The backup refers to an image it does not contain.');
      return blob;
    }
    if (Array.isArray(value)) return value.map(unpack);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, unpack(v)]));
    return value;
  };
  const records = {} as Record<Store, unknown[]>;
  for (const store of STORES) {
    const list = manifest.stores[store];
    records[store] = Array.isArray(list) ? list.filter((r) => r && typeof r === 'object' && typeof (r as { id?: unknown }).id === 'string').map(unpack) : [];
  }
  const settings = manifest.settings && typeof manifest.settings === 'object' ? manifest.settings : {};
  return {
    createdAt: Number(manifest.createdAt) || 0,
    app: String(manifest.app ?? '?'),
    settings: Object.keys(settings).length,
    counts: {
      photos: records.frames.length,
      journals: records.journals.length,
      recipes: records.presets.length,
      collections: records.collections.length,
      media: blobs.size,
      bytes: file.size,
    },
    async apply(withSettings) {
      for (const store of STORES) if (records[store].length) await putMany(store, records[store]);
      if (withSettings) {
        try {
          for (const [k, v] of Object.entries(settings)) if (SETTING_PREFIXES.some((p) => k.startsWith(p)) && typeof v === 'string') window.localStorage.setItem(k, v);
        } catch {
          /* settings are optional */
        }
      }
    },
  };
}

export type StorageInfo = { used: number; quota: number; persisted: boolean; supported: boolean };
export async function storageInfo(): Promise<StorageInfo> {
  try {
    const est = await navigator.storage?.estimate?.();
    const persisted = (await navigator.storage?.persisted?.()) ?? false;
    return { used: est?.usage ?? 0, quota: est?.quota ?? 0, persisted, supported: Boolean(est) };
  } catch {
    return { used: 0, quota: 0, persisted: false, supported: false };
  }
}
export async function askPersist() {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(2)} GB`;
