import { beforeEach, describe, expect, it, vi } from "vitest";

// Обзор web-push подписок в админке (/admin/push): чтение + удаление протухшей
// подписки. `@nb/db` мокается in-memory — реальный клиент БД в юнит-тест не тянем
// (по образцу tests/coverage-masters-lifecycle.test.ts).

vi.mock("server-only", () => ({}));

type Row = Record<string, any>;

const { rows } = vi.hoisted(() => ({ rows: { value: [] as Row[], deleted: [] as string[] } }));

vi.mock("@nb/db", () => {
  const db = {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          orderBy: async () => rows.value
        })
      })
    }),
    delete: () => ({
      where: (cond: any) => ({
        returning: async () => {
          const id = cond?.value;
          const found = rows.value.find((row) => row.id === id);
          if (!found) {
            return [];
          }
          rows.deleted.push(id);
          return [{ id }];
        }
      })
    })
  };

  return {
    db,
    desc: (col: unknown) => col,
    eq: (_col: unknown, value: unknown) => ({ value }),
    pushSubscriptions: { id: "id" },
    users: { id: "user_id" }
  };
});

import {
  deletePushSubscriptionById,
  listPushSubscriptions,
  resolvePushBrowser,
  resolvePushPlatform,
  resolvePushService
} from "@/features/notifications/admin";

const UA = {
  chromeAndroid:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  firefoxWindows: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  safariIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1",
  edgeWindows:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0",
  yandexMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 YaBrowser/23.11.0.0 Safari/537.36"
};

const seedRow = (partial: Partial<Row> = {}): Row => ({
  id: `00000000-0000-4000-8000-00000000000${rows.value.length + 1}`,
  userId: "user-1",
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  userAgent: UA.chromeAndroid,
  failureCount: 0,
  createdAt: new Date("2026-07-01T10:00:00Z"),
  updatedAt: new Date("2026-07-01T10:00:00Z"),
  displayName: "Иван",
  email: "ivan@example.com",
  anonymizedAt: null,
  ...partial
});

beforeEach(() => {
  rows.value = [];
  rows.deleted = [];
});

describe("разбор user-agent и endpoint", () => {
  it("узнаёт браузер, не путая Edge/Opera/Яндекс с Chrome", () => {
    expect(resolvePushBrowser(UA.chromeAndroid)).toBe("Chrome");
    expect(resolvePushBrowser(UA.firefoxWindows)).toBe("Firefox");
    expect(resolvePushBrowser(UA.safariIos)).toBe("Safari");
    expect(resolvePushBrowser(UA.edgeWindows)).toBe("Edge");
    expect(resolvePushBrowser(UA.yandexMac)).toBe("Яндекс.Браузер");
    expect(resolvePushBrowser(null)).toBe("—");
  });

  it("узнаёт платформу; Android важнее Linux в том же user-agent", () => {
    expect(resolvePushPlatform(UA.chromeAndroid)).toBe("Android");
    expect(resolvePushPlatform(UA.firefoxWindows)).toBe("Windows");
    expect(resolvePushPlatform(UA.safariIos)).toBe("iOS");
    expect(resolvePushPlatform(UA.yandexMac)).toBe("macOS");
    expect(resolvePushPlatform(null)).toBe("—");
  });

  it("берёт хост push-сервиса из endpoint, мусор не роняет", () => {
    expect(resolvePushService("https://fcm.googleapis.com/fcm/send/abc")).toBe("fcm.googleapis.com");
    expect(resolvePushService("https://web.push.apple.com/QWERTY")).toBe("web.push.apple.com");
    expect(resolvePushService("не ссылка")).toBe("—");
  });
});

describe("listPushSubscriptions", () => {
  it("пустой список — валидный ответ, а не падение", async () => {
    const overview = await listPushSubscriptions();
    expect(overview).toEqual({ items: [], total: 0, userCount: 0, failingCount: 0, browsers: [] });
  });

  it("считает подписки, уникальных пользователей, ошибки доставки и разбивку по браузерам", async () => {
    rows.value = [
      seedRow(),
      seedRow({ userId: "user-1", userAgent: UA.firefoxWindows, failureCount: 3 }),
      seedRow({ userId: "user-2", displayName: "Пётр", email: "petr@example.com", userAgent: UA.chromeAndroid })
    ];

    const overview = await listPushSubscriptions();

    expect(overview.total).toBe(3);
    expect(overview.userCount).toBe(2);
    expect(overview.failingCount).toBe(1);
    expect(overview.browsers).toEqual([
      { label: "Chrome", count: 2 },
      { label: "Firefox", count: 1 }
    ]);
    expect(overview.items[0]).toMatchObject({
      userName: "Иван",
      userEmail: "ivan@example.com",
      browser: "Chrome",
      platform: "Android",
      service: "fcm.googleapis.com"
    });
  });

  it("у обезличенного аккаунта e-mail не показывается", async () => {
    rows.value = [seedRow({ anonymizedAt: new Date("2026-07-02T00:00:00Z") })];

    const overview = await listPushSubscriptions();
    expect(overview.items[0].userEmail).toBeNull();
    expect(overview.items[0].userName).toBe("Иван");
  });
});

describe("deletePushSubscriptionById", () => {
  it("удаляет подписку по id", async () => {
    const row = seedRow();
    rows.value = [row];

    await expect(deletePushSubscriptionById(row.id)).resolves.toBeUndefined();
    expect(rows.deleted).toEqual([row.id]);
  });

  it("несуществующий id → NOT_FOUND", async () => {
    await expect(deletePushSubscriptionById("00000000-0000-4000-8000-00000000dead")).rejects.toThrow("NOT_FOUND");
  });

  it("мусорный id не долетает до Postgres (22P02) → NOT_FOUND", async () => {
    await expect(deletePushSubscriptionById("not-a-uuid")).rejects.toThrow("NOT_FOUND");
    expect(rows.deleted).toEqual([]);
  });
});
