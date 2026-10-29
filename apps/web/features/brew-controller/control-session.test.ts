import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let api: typeof import("./control-session");
let values: Map<string, string>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(async () => {
  vi.resetModules();
  values = new Map();
  vi.stubGlobal("window", { sessionStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  } });
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  api = await import("./control-session");
});
afterEach(() => { vi.unstubAllGlobals(); });

describe("control identity for start dialogs", () => {
  it("shares one tab identity with the dashboard", () => {
    const sessionId = api.getControlSessionId();
    expect(api.getControlSessionId()).toBe(sessionId);
    expect(values.get("nb_control_session_id")).toBe(sessionId);
  });

  it("shares one identity even if sessionStorage is unavailable", () => {
    vi.stubGlobal("window", { sessionStorage: { getItem: () => { throw new Error("storage denied"); } } });
    const sessionId = api.getControlSessionId();
    expect(api.getControlSessionId()).toBe(sessionId);
  });

  it("supports HTTP LAN contexts without crypto.randomUUID", () => {
    vi.stubGlobal("crypto", { getRandomValues: (bytes: Uint8Array) => bytes.fill(7) });
    expect(api.getControlSessionId()).toBe("07".repeat(16));
  });

  it("acquires only free or already-owned control before returning the tab identity", async () => {
    fetchMock.mockResolvedValue(Response.json({ lease: { heldByMe: true } }));
    const sessionId = await api.acquireStartControlLease("device");
    expect(fetchMock).toHaveBeenCalledWith("/api/devices/device/control-lease", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual({ action: "acquire", sessionId });
    expect(sessionId).toBe(api.getControlSessionId());
  });

  it("refuses another tab's lease without requesting takeover or release", async () => {
    fetchMock.mockResolvedValue(Response.json({ lease: { held: true, heldByMe: false } }));
    await expect(api.acquireStartControlLease("device")).rejects.toThrow("NO_CONTROL_LEASE");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).action).toBe("acquire");
  });

  it.each([{}, { lease: { heldByMe: "true" } }])("does not authorize from a malformed response", async body => {
    fetchMock.mockResolvedValue(Response.json(body));
    await expect(api.acquireStartControlLease("device")).rejects.toThrow("NO_CONTROL_LEASE");
  });

  it("refuses to start when the lease endpoint fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
    await expect(api.acquireStartControlLease("device")).rejects.toThrow("CONTROL_UNAVAILABLE");
    fetchMock.mockRejectedValueOnce(new Error("network offline"));
    await expect(api.acquireStartControlLease("device")).rejects.toThrow("CONTROL_UNAVAILABLE");
  });
});
