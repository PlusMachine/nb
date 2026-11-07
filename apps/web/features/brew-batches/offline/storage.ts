import { SESSION_OWNER_KEY, GUEST_OWNER } from "@/features/pwa/account-session";
import { normalizeBrewDayProgress } from "../brew-day";
import {
  applyOfflineBrew, offlineBrewCommandSchema, offlineBrewValues, stableOfflineJson,
  type OfflineBrewCommand, type OfflineBrewOperation, type OfflineBrewSnapshot
} from "./model";

const STORE = "batches";
export const OFFLINE_BREW_CHANNEL = "nb:offline-brew";

export type OfflineBrewRecord = {
  ownerId: string;
  batchId: string;
  serial: number;
  savedAt: string;
  snapshot: OfflineBrewSnapshot;
  queue: OfflineBrewOperation[];
  block?: { message: string; snapshot?: OfflineBrewSnapshot };
};

export function offlineBrewOwner(): string | null {
  try {
    const owner = localStorage.getItem(SESSION_OWNER_KEY);
    return owner === GUEST_OWNER ? null : owner;
  } catch {
    return null;
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("nb-offline-brew", 1);
    let blocked = false;
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore(STORE, { keyPath: ["ownerId", "batchId"] });
      store.createIndex("owner", "ownerId");
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => {
      blocked = true;
      reject(new Error("Закройте другие вкладки приложения и повторите."));
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      if (blocked) db.close();
      else resolve(db);
    };
  });
}

async function read<T>(query: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = query(db.transaction(STORE, "readonly").objectStore(STORE));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally {
    db.close();
  }
}

export const readOfflineBrew = (ownerId: string, batchId: string) => read<OfflineBrewRecord | undefined>(store => store.get([ownerId, batchId]));
export const listOfflineBrews = (ownerId: string) => read<OfflineBrewRecord[]>(store => store.index("owner").getAll(ownerId));

// A single read/write transaction serializes edits and acknowledgements from
// different tabs. The UI may report a save only after oncomplete.
export async function changeOfflineBrew(
  ownerId: string,
  batchId: string,
  change: (current: OfflineBrewRecord | undefined) => OfflineBrewRecord | undefined
): Promise<OfflineBrewRecord | undefined> {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      const request = store.get([ownerId, batchId]);
      let result: OfflineBrewRecord | undefined;
      let failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error);
      request.onsuccess = () => {
        try {
          const current = request.result as OfflineBrewRecord | undefined;
          const next = change(current);
          result = next;
          if (next && next !== current) {
            result = { ...next, serial: (current?.serial ?? 0) + 1 };
            store.put(result);
          }
        } catch (error) {
          failure = error;
          tx.abort();
        }
      };
    });
  } finally {
    db.close();
  }
}

export const projectOfflineBrew = (record: OfflineBrewRecord) => record.queue.reduce(applyOfflineBrew, record.snapshot);

export function makeOfflineBrewOperation(snapshot: OfflineBrewSnapshot, command: OfflineBrewCommand, at = new Date().toISOString()): OfflineBrewOperation {
  if (command.kind === "step" && command.patch.done !== undefined && command.patch.completedAt === undefined) {
    command = { ...command, patch: { ...command.patch, completedAt: command.patch.done ? at : null } };
  }
  return { id: crypto.randomUUID(), at, command, before: stableOfflineJson(offlineBrewValues(snapshot, command)) };
}

export async function prepareOfflineBrew(snapshot: OfflineBrewSnapshot): Promise<OfflineBrewRecord | undefined> {
  const { ownerId, batchId } = snapshot;
  const legacyKey = `nb:brew-progress:v1:${ownerId}:${batchId}`;
  let raw: string | null = null;
  let legacy: { version?: number; confirmed?: unknown; queued?: Record<string, unknown> } | null = null;
  try {
    raw = localStorage.getItem(legacyKey);
    legacy = JSON.parse(raw ?? "null");
  } catch { /* A malformed legacy value is left intact. */ }

  let imported = false;
  const result = await changeOfflineBrew(ownerId, batchId, current => {
    if (current) return current;
    let before = { ...snapshot, progress: normalizeBrewDayProgress(legacy?.confirmed) };
    const queue: OfflineBrewOperation[] = [];
    if (legacy?.version === 1 && legacy.queued && typeof legacy.queued === "object") {
      imported = true;
      for (const [stepId, value] of Object.entries(legacy.queued)) {
        if (!value || typeof value !== "object") {
          imported = false;
          continue;
        }
        const command = "transfer" in value
          ? { kind: "transfer", input: value.transfer }
          : { kind: "step", stepId, patch: value };
        const parsed = offlineBrewCommandSchema.safeParse(command);
        if (!parsed.success) {
          imported = false;
          continue;
        }
        const at = parsed.data.kind === "transfer" ? parsed.data.input.takenAt : undefined;
        const operation = makeOfflineBrewOperation(before, parsed.data, at);
        queue.push(operation);
        before = applyOfflineBrew(before, operation);
      }
    }
    return { ownerId, batchId, serial: 0, snapshot, queue, savedAt: new Date().toISOString() };
  });
  // The legacy entry remains recoverable until the replacement commits. A
  // second tab opening the same batch sees the existing record and skips import.
  if (result && imported) {
    try { if (localStorage.getItem(legacyKey) === raw) localStorage.removeItem(legacyKey); } catch { /* Optional cleanup. */ }
  }
  return result;
}
