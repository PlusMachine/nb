import { describe, expect, it } from "vitest";
import { analyticsDay, classifySource, csvDocument, parseActivityInput, parseAnalyticsRange, percent, sectionForPath } from "../features/product-analytics/contracts";
import { buildAdminUsersHref, parseAdminUserFilters } from "../features/admin-users/contracts";
import { resolveAdminNavGroups } from "../lib/admin-navigation";

describe("product analytics contracts", () => {
  it("accepts only known buckets and discards arbitrary personal data", () => {
    expect(parseActivityInput({ section: "recipes", source: "direct", device: "mobile", email: "private@example.com" })).toEqual({ section: "recipes", source: "direct", device: "mobile" });
    for (const section of ["admin", "login", "__proto__", "constructor", "/app/recipes/secret-id", null]) {
      expect(parseActivityInput({ section, source: "direct", device: "mobile" })).toBeNull();
    }
    expect(parseActivityInput({ section: "recipes", source: "__proto__", device: "desktop" })).toBeNull();
    expect(parseActivityInput({ section: "recipes", source: "direct", device: "anything" })).toBeNull();
  });
  it("buckets product routes and excludes admin, auth, API and legal pages", () => {
    expect(sectionForPath("/app/recipes/private-id?token=secret")).toBe("recipes");
    expect(sectionForPath("/app/brew-batches/id")).toBe("batches");
    expect(sectionForPath("/recipes/slug")).toBe("public_recipes");
    expect(sectionForPath("/calculators/abv")).toBe("calculators");
    expect(sectionForPath("/settings")).toBe("settings");
    expect(sectionForPath("/profile")).toBe("settings");
    expect(sectionForPath("/app/saved")).toBe("saved");
    expect(sectionForPath("/app/recipes/private-id/labels")).toBe("labels");
    expect(sectionForPath("/")).toBe("home");
    for (const path of ["/admin", "/admin/users", "/login", "/api/auth/magic", "/legal/privacy", "/catalogue", "/app/unknown"]) expect(sectionForPath(path)).toBeNull();
  });
  it("classifies sources without keeping the actual referrer", () => {
    expect(classifySource("https://yandex.ru/search?q=secret", "https://nb.example")).toBe("search");
    expect(classifySource("https://www.google.com/search?q=secret", "https://nb.example")).toBe("search");
    expect(classifySource("https://google.com.evil.example", "https://nb.example")).toBe("referral");
    expect(classifySource("https://vk.com/user", "https://nb.example")).toBe("social");
    expect(classifySource("https://nb.example/recipes", "https://nb.example")).toBe("internal");
    expect(classifySource("bad url", "https://nb.example")).toBe("direct");
  });
  it("uses Moscow calendar dates and caps invalid, future and oversized ranges", () => {
    const now = new Date("2026-10-30T22:00:00Z");
    expect(analyticsDay(now)).toBe("2026-10-31");
    expect(parseAnalyticsRange({}, now)).toMatchObject({ from: "2026-10-02", to: "2026-10-31", end: "2026-11-01", previousFrom: "2026-09-02", days: 30, audience: "customers" });
    expect(parseAnalyticsRange({ from: "2020-01-01", to: "2099-01-01", audience: "all" }, now)).toMatchObject({ from: "2026-08-03", to: "2026-10-31", days: 90, audience: "all" });
    expect(parseAnalyticsRange({ from: "2026-02-30", to: "invalid", days: "7" }, now).days).toBe(7);
    expect(parseAnalyticsRange({ from: "2026-10-31", to: "2026-10-31" }, now).days).toBe(1);
    expect(percent(2, 0)).toBe(0);
  });
  it("quotes CSV, preserves line breaks and neutralizes formulas", () => {
    expect(csvDocument([["Имя", "Число"], ['=HYPERLINK("evil")', 5], ["\t+123", "строка\nещё"]])).toBe('\uFEFF"Имя";"Число"\r\n"\'=HYPERLINK(""evil"")";"5"\r\n"\'\t+123";"строка\nещё"');
  });
  it("preserves segments through toolbar changes and rejects unknown filters", () => {
    expect(parseAdminUserFilters({ segment: "no_batches", sort: "last_seen" })).toMatchObject({ segment: "no_batches", sort: "last_seen" });
    expect(parseAdminUserFilters({ segment: "constructor" }).segment).toBeUndefined();
    expect(buildAdminUsersHref("/admin/users", { role: "user", segment: "active", q: " Иван " })).toContain("segment=active");
  });
  it("shows analytics only to administrators", () => {
    for (const role of ["user", "editor", "moderator"] as const) expect(resolveAdminNavGroups(role).flatMap(g => g.items).some(i => i.href === "/admin/analytics")).toBe(false);
    expect(resolveAdminNavGroups("admin")[0].items[0].href).toBe("/admin/analytics");
  });
});
