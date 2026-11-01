/**
 * photoDb.js
 * High-capacity IndexedDB local storage engine for WASHEK Progress Photos.
 * Eliminates LocalStorage 5MB quota errors and provides instant, offline-resilient
 * persistence for image data URLs and blobs.
 */

const DB_NAME = 'washek_photos_db';
const DB_VERSION = 1;
const STORE_NAME = 'photos';

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      resolve(null);
      return;
    }

    try {
      const request = window.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };

      request.onsuccess = (event) => {
        resolve(event.target.result);
      };

      request.onerror = (event) => {
        console.warn('[photoDb] IndexedDB open error:', event.target.error);
        resolve(null);
      };
    } catch (err) {
      console.warn('[photoDb] IndexedDB initialization exception:', err);
      resolve(null);
    }
  });
}

/**
 * Store a photo data URL or blob keyed by photo ID
 */
export async function storePhotoData(id, dataUrl) {
  if (!id || !dataUrl) return;

  // 1. Always attempt localStorage as fast secondary cache if small enough
  try {
    if (typeof dataUrl === 'string' && dataUrl.length < 250000) {
      localStorage.setItem(`washek_photo_${id}`, dataUrl);
    }
  } catch (_e) {
    /* ignore quota exception */
  }

  // 2. Primary durable storage in IndexedDB (no 5MB cap)
  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const record = {
        id: String(id),
        data: dataUrl,
        updated_at: Date.now(),
      };
      const req = store.put(record);
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Retrieve photo data URL by photo ID
 */
export async function getPhotoData(id) {
  if (!id) return null;

  // 1. Quick check localStorage
  try {
    const cached = localStorage.getItem(`washek_photo_${id}`);
    if (cached && (cached.startsWith('data:') || cached.startsWith('blob:') || cached.startsWith('http'))) {
      return cached;
    }
  } catch (_e) {
    /* ignore */
  }

  // 2. Read from IndexedDB
  const db = await openDatabase();
  if (!db) return null;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.get(String(id));
      req.onsuccess = () => {
        const result = req.result;
        resolve(result?.data || null);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Delete photo data by ID
 */
export async function deletePhotoData(id) {
  if (!id) return;

  try {
    localStorage.removeItem(`washek_photo_${id}`);
  } catch (_e) {
    /* ignore */
  }

  const db = await openDatabase();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const req = store.delete(String(id));
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}
