/**
 * Durable ACIA completion payload storage using IndexedDB.
 * Survives page refresh/close — deleted only after server confirms persistence.
 */

const DB_NAME = 'aacp_acia';
const STORE = 'pending_completions';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'submissionId' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export interface PendingCompletion {
  submissionId: string;
  stage: string;
  payload: Record<string, unknown>;
  savedAt: string;
  attemptCount: number;
}

export async function savePendingCompletion(entry: PendingCompletion): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Fallback to sessionStorage if IndexedDB unavailable
    try { sessionStorage.setItem(`acia_pending_${entry.submissionId}`, JSON.stringify(entry)); } catch {}
  }
}

export async function getPendingCompletion(submissionId: string): Promise<PendingCompletion | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(submissionId);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    try {
      const raw = sessionStorage.getItem(`acia_pending_${submissionId}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }
}

export async function getAllPendingCompletions(): Promise<PendingCompletion[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result ?? []);
      req.onerror = () => reject(req.error);
    });
  } catch { return []; }
}

export async function deletePendingCompletion(submissionId: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(submissionId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
  try { sessionStorage.removeItem(`acia_pending_${submissionId}`); } catch {}
}

export async function incrementAttemptCount(submissionId: string): Promise<void> {
  const existing = await getPendingCompletion(submissionId);
  if (existing) {
    await savePendingCompletion({ ...existing, attemptCount: existing.attemptCount + 1 });
  }
}
