import type { Collection, JournalBook, PhotoRecord, UserPreset } from '../types';

const DB_NAME = 'nostalgia-studio';
const STORE = 'frames';
const JOURNALS = 'journals';
const PRESETS = 'presets';
const COLLECTIONS = 'collections';
const VERSION = 4;
/** Every store, in the order a backup writes and restores them. */
export const STORES = [STORE, JOURNALS, PRESETS, COLLECTIONS] as const;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(JOURNALS)) {
          db.createObjectStore(JOURNALS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(PRESETS)) {
          db.createObjectStore(PRESETS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(COLLECTIONS)) {
          db.createObjectStore(COLLECTIONS, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        // let a newer tab upgrade the schema instead of being blocked by this one
        request.result.onversionchange = () => {
          request.result.close();
          dbPromise = null;
        };
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store, 'readonly').objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

async function write(store: string, action: (s: IDBObjectStore) => void): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, 'readwrite');
    action(transaction.objectStore(store));
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllPhotos(): Promise<PhotoRecord[]> {
  return (await getAll<PhotoRecord>(STORE)).sort((a, b) => b.createdAt - a.createdAt);
}
export const savePhoto = (record: PhotoRecord) => write(STORE, (s) => s.put(record));
export const deletePhoto = (id: string) => write(STORE, (s) => s.delete(id));

export async function getAllJournals(): Promise<JournalBook[]> {
  return (await getAll<JournalBook>(JOURNALS)).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const saveJournal = (book: JournalBook) => write(JOURNALS, (s) => s.put(book));
export const deleteJournal = (id: string) => write(JOURNALS, (s) => s.delete(id));

export async function getAllPresets(): Promise<UserPreset[]> {
  return (await getAll<UserPreset>(PRESETS)).sort((a, b) => b.createdAt - a.createdAt);
}
export const savePreset = (preset: UserPreset) => write(PRESETS, (s) => s.put(preset));
export const deletePreset = (id: string) => write(PRESETS, (s) => s.delete(id));

export async function getAllCollections(): Promise<Collection[]> {
  return (await getAll<Collection>(COLLECTIONS)).sort((a, b) => b.updatedAt - a.updatedAt);
}
export const saveCollection = (item: Collection) => write(COLLECTIONS, (s) => s.put(item));
export const deleteCollection = (id: string) => write(COLLECTIONS, (s) => s.delete(id));

/** Put many records into one store in a single transaction (used by restore). */
export const putMany = (store: (typeof STORES)[number], records: unknown[]) => write(store, (s) => records.forEach((r) => s.put(r)));
