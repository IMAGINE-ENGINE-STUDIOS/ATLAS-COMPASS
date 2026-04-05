const DB_NAME = "atlas-model-files";
const STORE_NAME = "models";
const DB_VERSION = 1;

interface StoredModelRecord {
  id: string;
  blob: Blob;
  fileName: string;
  savedAt: number;
}

function openAtlasModelDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open Atlas model storage"));
  });
}

export async function saveAtlasModelBlob(id: string, blob: Blob, fileName: string) {
  const db = await openAtlasModelDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put({ id, blob, fileName, savedAt: Date.now() } satisfies StoredModelRecord);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to save Atlas model"));
    tx.onabort = () => reject(tx.error ?? new Error("Saving Atlas model was aborted"));
  });

  db.close();
}

export async function loadAtlasModelBlob(id: string): Promise<Blob | null> {
  const db = await openAtlasModelDb();

  const record = await new Promise<StoredModelRecord | undefined>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const request = tx.objectStore(STORE_NAME).get(id);
    request.onsuccess = () => resolve(request.result as StoredModelRecord | undefined);
    request.onerror = () => reject(request.error ?? new Error("Failed to load Atlas model"));
  });

  db.close();
  return record?.blob ?? null;
}

export async function deleteAtlasModelBlob(id: string) {
  const db = await openAtlasModelDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete Atlas model"));
    tx.onabort = () => reject(tx.error ?? new Error("Deleting Atlas model was aborted"));
  });

  db.close();
}