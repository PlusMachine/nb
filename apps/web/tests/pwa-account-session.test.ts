import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { clearPrivateBrowserData, syncBrowserAccount, logoutBrowserSession, SESSION_OWNER_KEY } from "../features/pwa/account-session";

class MemoryStorage {
  [key: string]: unknown;
  getItem(key: string) { return typeof this[key] === "string" ? this[key] as string : null; }
  setItem(key: string, value: string) { this[key] = String(value); }
  removeItem(key: string) { delete this[key]; }
}
let storage: MemoryStorage;
const assign = vi.fn();
beforeEach(() => { storage = new MemoryStorage(); vi.stubGlobal("localStorage", storage); vi.stubGlobal("window", { location: { assign } }); assign.mockClear(); });
afterEach(() => vi.unstubAllGlobals());
const privateData = () => {
  storage.setItem("nb_device_local_urls", "private device A");
  storage.setItem("nb:recipe-water:source-profiles", "private water A");
  storage.setItem("nb:recipe-water:target-profiles", "private target A");
  storage.setItem("nb:recipe-water:migrated", "1");
  storage.setItem("nb-home-note:recipe-a", "private note A");
  storage.setItem("nb:brew-progress:v1:a:batch", "private queue A");
  storage.setItem("theme", "dark");
  storage.setItem("calculator:og", "unrelated calculator state");
};
describe("PWA account data boundaries", () => {
  it("preserves this user's data during refresh and invalidates it on an account switch", () => {
    syncBrowserAccount("a"); privateData(); syncBrowserAccount("a");
    expect(storage.getItem("nb_device_local_urls")).toContain("private");
    syncBrowserAccount("b");
    expect(Object.keys(storage).sort()).toEqual(["calculator:og", "nb:session-owner", "theme"]);
    expect(storage.getItem(SESSION_OWNER_KEY)).toBe("b");
    expect(storage.getItem("theme")).toBe("dark");
  });
  it("keeps an explicitly owned brew queue on first upgrade while discarding unattributed legacy caches", () => {
    privateData(); storage.setItem("nb:brew-progress:v1:b:batch", "another user's queue");
    syncBrowserAccount("a");
    expect(storage.getItem("nb:brew-progress:v1:a:batch")).toBe("private queue A");
    expect(storage.getItem("nb:brew-progress:v1:b:batch")).toBeNull();
    expect(storage.getItem("nb_device_local_urls")).toBeNull();
  });
  for (const mode of ["network", "http", "body"]) it(`keeps private data and navigation unchanged when logout fails: ${mode}`, async () => {
    syncBrowserAccount("a"); privateData();
    vi.stubGlobal("fetch", mode === "network" ? vi.fn().mockRejectedValue(new Error("offline")) : vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: false }), { status: mode === "http" ? 503 : 200 })));
    await expect(logoutBrowserSession("/")).rejects.toThrow();
    expect(storage.getItem("nb_device_local_urls")).toContain("private");
    expect(storage.getItem(SESSION_OWNER_KEY)).toBe("a");
    expect(assign).not.toHaveBeenCalled();
  });
  it("clears private data only after a confirmed logout and requests a fresh document", async () => {
    syncBrowserAccount("a"); privateData();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }))));
    await logoutBrowserSession("/catalog");
    expect(storage.getItem(SESSION_OWNER_KEY)).toBe("guest");
    expect(storage.getItem("nb_device_local_urls")).toBeNull();
    expect(storage.getItem("theme")).toBe("dark");
    expect(assign).toHaveBeenCalledWith("/catalog");
  });
  it("preserves queued work through passive expiry and reauthentication, then clears it for a different account", () => {
    syncBrowserAccount("a"); privateData();
    syncBrowserAccount(null);
    expect(storage.getItem("nb:brew-progress:v1:a:batch")).toBe("private queue A");
    expect(storage.getItem("nb_device_local_urls")).toBeNull();
    syncBrowserAccount("a");
    expect(storage.getItem("nb:brew-progress:v1:a:batch")).toBe("private queue A");
    syncBrowserAccount("b");
    expect(storage.getItem("nb:brew-progress:v1:a:batch")).toBeNull();
  });
  it("does not crash if browser storage is denied", () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("denied"); } });
    expect(() => syncBrowserAccount("a")).not.toThrow();
    expect(() => clearPrivateBrowserData()).not.toThrow();
  });
});
