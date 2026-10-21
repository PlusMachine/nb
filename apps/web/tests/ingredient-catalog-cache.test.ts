import { describe, expect, it, vi } from "vitest";

import { createCatalogSnapshotCache } from "../features/ingredients/catalog-cache";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

describe("catalog snapshot cache", () => {
  it("shares one cold load among concurrent requests and preserves Date objects", async () => {
    const cache = createCatalogSnapshotCache<Date[]>({ ttlMs: 100 });
    const pending = deferred<Date[]>();
    const load = vi.fn(() => pending.promise);
    const requests = Array.from({ length: 10 }, () => cache.get("all", load));
    await Promise.resolve();
    expect(load).toHaveBeenCalledTimes(1);
    const dates = [new Date("2026-10-16T10:00:00Z")];
    pending.resolve(dates);
    expect(await Promise.all(requests)).toEqual(Array.from({ length: 10 }, () => dates));
    expect((await cache.get("all", load))[0]).toBe(dates[0]);
  });

  it("starts TTL when loading finishes and reloads on expiry", async () => {
    let now = 0;
    const cache = createCatalogSnapshotCache<string>({ ttlMs: 100, now: () => now });
    const pending = deferred<string>();
    const first = cache.get("all", () => pending.promise);
    now = 500;
    pending.resolve("first");
    await first;
    const load = vi.fn(async () => "next");
    now = 599;
    expect(await cache.get("all", load)).toBe("first");
    now = 600;
    expect(await cache.get("all", load)).toBe("next");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("does not republish an old snapshot or clear a newer loader after invalidation", async () => {
    const cache = createCatalogSnapshotCache<string>({ ttlMs: 100 });
    const old = deferred<string>();
    const current = deferred<string>();
    const first = cache.get("all", () => old.promise);
    cache.clear();
    const load = vi.fn(() => current.promise);
    const second = cache.get("all", load);
    old.resolve("old");
    expect(await first).toBe("old");
    const third = cache.get("all", load);
    current.resolve("current");
    expect(await second).toBe("current");
    expect(await third).toBe("current");
    expect(await cache.get("all", async () => "unexpected")).toBe("current");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("retries a failed load and keeps separate filter keys", async () => {
    const cache = createCatalogSnapshotCache<string>({ ttlMs: 100 });
    await expect(cache.get("hop", async () => { throw new Error("DB down"); })).rejects.toThrow("DB down");
    expect(await cache.get("hop", async () => "hops")).toBe("hops");
    expect(await cache.get("yeast", async () => "yeasts")).toBe("yeasts");
    cache.clear();
    expect(await cache.get("hop", async () => "updated")).toBe("updated");
  });

  it("bounds completed snapshots instead of keeping every filter key forever", async () => {
    const cache = createCatalogSnapshotCache<string>({ ttlMs: 100, maxEntries: 2 });
    for (const key of ["hop", "malt", "yeast"]) await cache.get(key, async () => key);
    expect(await cache.get("hop", async () => "reloaded")).toBe("reloaded");
    expect(await cache.get("yeast", async () => "unexpected")).toBe("yeast");
  });
});
