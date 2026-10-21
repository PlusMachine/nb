// Process-local snapshots; the cache contains public catalog data only.
export const createCatalogSnapshotCache = <T>({ ttlMs, maxEntries = 32, now = Date.now }: {
  ttlMs: number;
  maxEntries?: number;
  now?: () => number;
}) => {
  const entries = new Map<string, { value: T; loadedAt: number }>();
  const pending = new Map<string, Promise<T>>();
  let generation = 0;

  return {
    clear() {
      generation += 1;
      entries.clear();
      pending.clear();
    },
    async get(key: string, load: () => Promise<T>): Promise<T> {
      const cached = entries.get(key);
      if (cached && now() - cached.loadedAt < ttlMs) {
        return cached.value;
      }
      const inFlight = pending.get(key);
      if (inFlight) {
        return inFlight;
      }

      const startedInGeneration = generation;
      const promise = Promise.resolve().then(load).then((value) => {
        // An invalidated loader may still finish for its original callers,
        // but must never republish an obsolete snapshot for new requests.
        if (generation === startedInGeneration) {
          entries.delete(key);
          entries.set(key, { value, loadedAt: now() });
          while (entries.size > maxEntries) {
            entries.delete(entries.keys().next().value!);
          }
        }
        return value;
      }).finally(() => {
        if (pending.get(key) === promise) {
          pending.delete(key);
        }
      });
      pending.set(key, promise);
      return promise;
    }
  };
};
