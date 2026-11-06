import type { JournalBook, PhotoRecord } from '../types';

const DB_NAME = 'nostalgia-studio';
const STORE = 'frames';
const JOURNALS = 'journals';
const VERSION = 2;

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
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return dbPromise;
}

async function getAll<T>(store: string): Promise<T[]> {
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
