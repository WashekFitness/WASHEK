/**
 * photoDb.js
 * High-capacity IndexedDB local storage engine for WASHEK Progress Photos.
 * Eliminates LocalStorage 5MB quota errors and provides instant, offline-resilient
 * persistence for both image data URLs and structured photo metadata records.
 */

const DB_NAME = 'washek_photos_db';
const DB_VERSION = 2;
const STORE_NAME = 'photos';
const RECORDS_STORE_NAME = 'photo_records';

function openDatabase() {
  return new Promise((resolve) => {
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
        if (!db.objectStoreNames.contains(RECORDS_STORE_NAME)) {
          db.createObjectStore(RECORDS_STORE_NAME, { keyPath: 'id' });
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

function sanitizeRecordForMetadataStore(record) {
  if (!record || typeof record !== 'object') return record;
  const copy = { ...record };
  if (typeof copy.resolved_photo_url === 'string' && (copy.resolved_photo_url.startsWith('data:') || copy.resolved_photo_url.startsWith('blob:')) && copy.resolved_photo_url.length > 4096) {
    delete copy.resolved_photo_url;
  }
  if (typeof copy.photo_url === 'string' && (copy.photo_url.startsWith('data:') || copy.photo_url.startsWith('blob:')) && copy.photo_url.length > 4096 && copy.id) {
    copy.photo_url = `idb://${copy.id}`;
  }
  return copy;
}

/**
 * Store a photo data URL keyed by photo ID inside IndexedDB.
 * Deliberately avoids bloated localStorage writes that trigger 5MB QuotaExceededError.
 */
export async function storePhotoData(id, dataUrl) {
  if (!id || !dataUrl) return false;
  const idStr = String(id);

  // Clean up any legacy localStorage photo key so origin quota stays healthy
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`washek_photo_${idStr}`);
    }
  } catch {
    // ignore
  }

  const db = await openDatabase();
  if (!db) {
    // Environments without IndexedDB: best-effort small cache
    try {
      if (typeof localStorage !== 'undefined' && typeof dataUrl === 'string' && dataUrl.length < 250000) {
        localStorage.setItem(`washek_photo_${idStr}`, dataUrl);
        return true;
      }
    } catch {
      // ignore quota
    }
    return false;
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const record = {
        id: idStr,
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
 * Retrieve photo data URL by photo ID (IndexedDB primary, with legacy localStorage migration)
 */
export async function getPhotoData(id) {
  if (!id) return null;
  const idStr = String(id);

  const db = await openDatabase();
  if (db) {
    const fromIdb = await new Promise((resolve) => {
      try {
        const transaction = db.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const req = store.get(idStr);
        req.onsuccess = () => resolve(req.result?.data || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
    if (fromIdb) return fromIdb;
  }

  // Fallback check for legacy localStorage cache and migrate into IndexedDB
  try {
    if (typeof localStorage !== 'undefined') {
      const cached = localStorage.getItem(`washek_photo_${idStr}`);
      if (cached && (cached.startsWith('data:') || cached.startsWith('http'))) {
        if (db) {
          await storePhotoData(idStr, cached);
        }
        return cached;
      }
    }
  } catch {
    // ignore
  }

  return null;
}

/**
 * Store structured photo metadata record in IndexedDB
 */
export async function storePhotoRecord(record) {
  if (!record?.id) return false;
  const db = await openDatabase();
  if (!db) return false;

  const clean = sanitizeRecordForMetadataStore(record);
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([RECORDS_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(RECORDS_STORE_NAME);
      const getReq = store.get(String(record.id));
      getReq.onsuccess = () => {
        const existing = getReq.result || {};
        const merged = { ...existing, ...clean, id: String(record.id) };
        const putReq = store.put(merged);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => resolve(false);
      };
      getReq.onerror = () => {
        const putReq = store.put(clean);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => resolve(false);
      };
    } catch {
      resolve(false);
    }
  });
}

/**
 * Retrieve all stored progress photo metadata records from IndexedDB
 */
export async function getAllPhotoRecords() {
  const db = await openDatabase();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([RECORDS_STORE_NAME], 'readonly');
      const store = transaction.objectStore(RECORDS_STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        resolve(Array.isArray(req.result) ? req.result : []);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Delete photo record metadata from IndexedDB
 */
export async function deletePhotoRecord(id) {
  if (!id) return false;
  const db = await openDatabase();
  if (!db) return false;

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction([RECORDS_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(RECORDS_STORE_NAME);
      const req = store.delete(String(id));
      req.onsuccess = () => resolve(true);
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Delete photo data and metadata by ID
 */
export async function deletePhotoData(id) {
  if (!id) return;
  const idStr = String(id);

  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(`washek_photo_${idStr}`);
    }
  } catch {
    // ignore
  }

  const db = await openDatabase();
  if (!db) return;

  const storeNames = [STORE_NAME];
  if (db.objectStoreNames.contains(RECORDS_STORE_NAME)) {
    storeNames.push(RECORDS_STORE_NAME);
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(storeNames, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(idStr);
      if (storeNames.includes(RECORDS_STORE_NAME)) {
        transaction.objectStore(RECORDS_STORE_NAME).delete(idStr);
      }
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

let hasPrunedLegacyStorage = false;

/**
 * Migrates any oversized legacy `washek_photo_*` or inline base64 strings inside
 * `washek_entity_progress_photos_*` out of localStorage into IndexedDB so 5MB
 * QuotaExceededError never blocks saving new photos or app state.
 */
export async function pruneLegacyLocalStoragePhotos() {
  if (hasPrunedLegacyStorage || typeof localStorage === 'undefined') return;
  hasPrunedLegacyStorage = true;

  try {
    const photoKeys = [];
    const entityKeys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key.startsWith('washek_photo_')) {
        photoKeys.push(key);
      } else if (key.startsWith('washek_entity_progress_photos_')) {
        entityKeys.push(key);
      }
    }

    for (const key of photoKeys) {
      try {
        const val = localStorage.getItem(key);
        const photoId = key.slice('washek_photo_'.length);
        if (val && photoId && (val.startsWith('data:') || val.startsWith('http'))) {
          await storePhotoData(photoId, val);
        } else {
          localStorage.removeItem(key);
        }
      } catch {
        // ignore individual migration error
      }
    }

    for (const key of entityKeys) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) continue;

        let changed = false;
        const compacted = [];
        for (const item of parsed) {
          if (!item || !item.id) continue;
          let itemChanged = false;
          const next = { ...item };

          if (typeof next.photo_url === 'string' && next.photo_url.startsWith('data:') && next.photo_url.length > 4096) {
            await storePhotoData(next.id, next.photo_url);
            next.photo_url = `idb://${next.id}`;
            itemChanged = true;
          }
          if (typeof next.resolved_photo_url === 'string' && (next.resolved_photo_url.startsWith('data:') || next.resolved_photo_url.startsWith('blob:')) && next.resolved_photo_url.length > 4096) {
            if (next.resolved_photo_url.startsWith('data:')) {
              await storePhotoData(next.id, next.resolved_photo_url);
            }
            delete next.resolved_photo_url;
            itemChanged = true;
          }

          await storePhotoRecord(next);
          if (itemChanged) changed = true;
          compacted.push(next);
        }

        if (changed) {
          localStorage.setItem(key, JSON.stringify(compacted));
        }
      } catch {
        // ignore parse/write errors during pruning
      }
    }
  } catch {
    // ignore storage enumeration errors
  }
}
