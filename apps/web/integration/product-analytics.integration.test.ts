import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool, users, recipes, brewBatches, productActivityDaily, eq, inArray } from "@nb/db";
import { getAnalyticsOverview, getUserAnalytics, recordProductActivity } from "../features/product-analytics/service";
import { parseAnalyticsRange } from "../features/product-analytics/contracts";
import { listAdminUsers, listAdminUsersForExport } from "../features/admin-users/service";

const ids: string[] = [];
const now = new Date("2040-05-03T12:00:00Z");
const range = parseAnalyticsRange({ from: "2040-04-01", to: "2040-05-02" }, now);
let a: string, b: string, staff: string, anon: string;
const activity = { section: "recipes", source: "direct", device: "mobile" } as const;
const account = async (role: "admin" | "user" = "user") => {
  const id = randomUUID(); ids.push(id);
  await db.insert(users).values({ id, email: `qa.analytics.${id}@localhost`, displayName: "Analytics fixture", role, createdAt: new Date("2040-04-01T10:00:00Z") });
  return id;
};
const recipe = async (userId: string) => {
  const [r] = await db.insert(recipes).values({ authorId: userId, recipeFamilyId: randomUUID(), title: "Analytics fixture", slug: randomUUID(), batchSizeEnteredQuantity: 20, batchSizeEnteredUnit: "l", batchSizeNormalizedQuantity: 20, batchSizeNormalizedUnit: "l", createdAt: new Date("2040-04-02T12:00:00Z") }).returning({ id: recipes.id });
  return r.id;
};
beforeAll(async () => {
  if (process.env.NODE_ENV === "production" || !["localhost", "127.0.0.1", "postgres"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local database required");
  a = await account(); b = await account(); staff = await account("admin"); anon = await account();
  const r = await recipe(a); await recipe(staff);
  await db.insert(brewBatches).values([
    { userId: a, recipeId: r, name: "Own recipe", brewNumber: 1, status: "completed", createdAt: new Date("2040-04-03T12:00:00Z"), completedAt: new Date("2040-04-04T12:00:00Z") },
    { userId: b, recipeId: r, name: "Someone else's recipe", brewNumber: 1, status: "completed", createdAt: new Date("2040-04-03T12:00:00Z"), completedAt: new Date("2040-04-04T12:00:00Z") }
  ]);
  await Promise.all([recordProductActivity(a, activity, new Date("2040-04-02T12:00:00Z")), recordProductActivity(a, activity, new Date("2040-04-02T12:00:01Z"))]);
  await recordProductActivity(a, { ...activity, source: "search" }, new Date("2040-04-08T12:00:00Z"));
  await recordProductActivity(a, activity, new Date("2040-05-01T12:00:00Z"));
  await recordProductActivity(staff, activity, new Date("2040-04-02T12:00:00Z"));
  await recordProductActivity(anon, activity, new Date("2040-04-02T12:00:00Z"));
  await db.update(users).set({ anonymizedAt: new Date() }).where(eq(users.id, anon));
});
afterAll(async () => {
  if (ids.length) {
    await db.delete(brewBatches).where(inArray(brewBatches.userId, ids));
    await db.delete(users).where(inArray(users.id, ids));
  }
  await pool.end();
});
describe("product analytics on PostgreSQL", () => {
  it("deduplicates concurrent daily buckets and distinguishes users from views", async () => {
    const buckets = await db.select().from(productActivityDaily).where(eq(productActivityDaily.userId, a));
    expect(buckets).toHaveLength(3);
    expect(buckets.find(r => r.day === "2040-04-02")?.views).toBe(2);
    const detail = await getUserAnalytics(a);
    expect(detail).toMatchObject({ activeDays: 3, views: 4, lastSeenAt: "2040-05-01T12:00:00.000Z" });
  });
  it("calculates strict funnel, period metrics and zero-filled days without counting staff or anonymized users", async () => {
    const report = await getAnalyticsOverview(range, now);
    expect(report.metrics).toMatchObject({ newUsers: 2, activeUsers: 1, views: 4, recipes: 1, batches: 2, completedBatches: 2, activation: 1, medianActivationHours: 26, dau: 0, wau: 1, mau: 1 });
    expect(report.funnel.map(s => s.users)).toEqual([2,1,1,1]);
    expect(report.trend).toHaveLength(32);
    expect(report.trend.find(d => d.day === "2040-04-02")).toMatchObject({ active: 1, registrations: 0, views: 2 });
    expect(report.trend.find(d => d.day === "2040-04-05")?.active).toBe(0);
    const all = await getAnalyticsOverview({ ...range, audience: "all" }, now);
    expect(all.metrics.newUsers).toBe(3);
    expect(all.metrics.activeUsers).toBe(2);
  });
  it("measures exact-day retention with mature denominators and leaves immature cohorts null", async () => {
    const report = await getAnalyticsOverview(range, now);
    expect(report.retention).toEqual([{ day: 1, eligible: 2, returned: 1 }, { day: 7, eligible: 2, returned: 1 }, { day: 30, eligible: 2, returned: 1 }]);
    expect(report.cohorts[0]).toMatchObject({ users: 2, returns: [1,0,0,0] });
    const short = await getAnalyticsOverview(parseAnalyticsRange({ from: "2040-04-01", to: "2040-04-03" }, now), now);
    expect(short.retention.find(r => r.day === 7)).toEqual({ day: 7, eligible: 0, returned: 0 });
    expect(short.cohorts[0].returns).toEqual([null,null,null,null]);
    const historic = await getAnalyticsOverview(parseAnalyticsRange({ from: "2020-04-01", to: "2020-04-03" }, now), now);
    expect(historic.trend.every(d => d.active === null && d.views === null)).toBe(true);
  });
  it("filters user segments consistently for the list and export", async () => {
    const filters = { q: "qa.analytics.", segment: "brewers" as const };
    const list = await listAdminUsers(filters);
    const exported = await listAdminUsersForExport(filters);
    expect(list.items.map(u => u.id).sort()).toEqual([a,b].sort());
    expect(exported.map(u => u.id).sort()).toEqual([a,b].sort());
  });
  it("rejects collection for anonymized and blocked accounts", async () => {
    await recordProductActivity(anon, activity, now);
    expect((await getUserAnalytics(anon)).views).toBe(0);
    await db.update(users).set({ blockedAt: new Date() }).where(eq(users.id, b));
    await recordProductActivity(b, activity, now);
    expect(await db.select().from(productActivityDaily).where(eq(productActivityDaily.userId, b))).toEqual([]);
  });
});
