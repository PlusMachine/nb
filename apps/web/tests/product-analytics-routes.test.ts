import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), cookie: vi.fn(), limit: vi.fn(), record: vi.fn(), overview: vi.fn(), exportUsers: vi.fn(), csv: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getSessionUser: mock.user }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: mock.cookie }) }));
vi.mock("@nb/auth", () => ({ assertRateLimit: mock.limit }));
vi.mock("@/features/product-analytics/service", () => ({ recordProductActivity: mock.record, getAnalyticsOverview: mock.overview }));
vi.mock("@/features/admin-users/service", () => ({ listAdminUsersForExport: mock.exportUsers }));
vi.mock("@/features/product-analytics/export", () => ({ exportAnalyticsCsv: mock.csv }));
import { POST } from "../app/api/analytics/activity/route";
import { GET as exportAnalytics } from "../app/api/admin/analytics/export/route";
import { GET as exportUsers } from "../app/api/admin/users/export/route";
const request = (body: unknown = { section: "recipes", source: "direct", device: "mobile" }, origin = "https://nb.example") => new Request("https://nb.example/api/analytics/activity", { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.clearAllMocks();
  mock.user.mockResolvedValue({ id: "user-1", role: "user" });
  mock.cookie.mockReturnValue({ value: "1:all" });
  mock.limit.mockResolvedValue(undefined); mock.record.mockResolvedValue(undefined);
});
describe("activity consent and authorization", () => {
  it("does not authenticate or write without analytics consent", async () => {
    for (const value of [undefined, "1:necessary", "0:all"]) {
      mock.cookie.mockReturnValue(value ? { value } : undefined);
      expect((await POST(request())).status).toBe(204);
    }
    expect(mock.user).not.toHaveBeenCalled(); expect(mock.record).not.toHaveBeenCalled();
  });
  it("rejects cross-origin writes and anonymous requests", async () => {
    expect((await POST(request(undefined, "https://evil.example"))).status).toBe(403);
    mock.user.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect(mock.record).not.toHaveBeenCalled();
  });
  it("takes user identity from the session and validates buckets", async () => {
    expect((await POST(request({ section: "recipes", source: "direct", device: "mobile", userId: "victim" }))).status).toBe(204);
    expect(mock.record).toHaveBeenCalledWith("user-1", { section: "recipes", source: "direct", device: "mobile" });
    expect((await POST(request({ section: "admin", source: "direct", device: "mobile" }))).status).toBe(400);
  });
  it("limits payloads and writes and isolates storage failures", async () => {
    expect((await POST(request({ section: "x".repeat(1000) }))).status).toBe(413);
    mock.limit.mockRejectedValueOnce(new Error("RATE_LIMIT"));
    expect((await POST(request())).status).toBe(429);
    mock.record.mockRejectedValueOnce(new Error("DB"));
    expect((await POST(request())).status).toBe(503);
  });
});
describe("private CSV exports", () => {
  it("rejects every non-admin before reading any data", async () => {
    for (const user of [null, { role: "user" }, { role: "editor" }, { role: "moderator" }]) {
      mock.user.mockResolvedValue(user);
      expect((await exportAnalytics(new Request("https://nb.example/api/admin/analytics/export"))).status).toBe(user ? 403 : 401);
      expect((await exportUsers(new Request("https://nb.example/api/admin/users/export"))).status).toBe(user ? 403 : 401);
    }
    expect(mock.overview).not.toHaveBeenCalled(); expect(mock.exportUsers).not.toHaveBeenCalled();
  });
  it("exports the selected segment without pagination and prevents caching", async () => {
    mock.user.mockResolvedValue({ id: "admin", role: "admin" });
    mock.exportUsers.mockResolvedValue([{ id: "id", displayName: "=evil()", email: null, phone: null, role: "user", blockedAt: null, anonymizedAt: null, createdAt: new Date("2026-10-01"), lastSeenAt: null, recipesCount: 2, batchesCount: 0 }]);
    const response = await exportUsers(new Request("https://nb.example/api/admin/users/export?segment=no_batches&role=user"));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.text()).toContain("'=evil()");
    expect(mock.exportUsers).toHaveBeenCalledWith(expect.objectContaining({ segment: "no_batches", role: "user" }));
  });
  it("refuses oversized exports rather than silently truncating", async () => {
    mock.user.mockResolvedValue({ role: "admin" }); mock.exportUsers.mockResolvedValue(new Array(10001));
    expect((await exportUsers(new Request("https://nb.example/api/admin/users/export"))).status).toBe(413);
  });
});
