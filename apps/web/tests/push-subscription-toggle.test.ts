import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Тумблер уведомлений: его состояние = браузерная подписка ∩ строка в БД.
// Блокировка аккаунта сносит push_subscriptions, а браузерный PushSubscription
// остаётся жив — раньше тумблер читал только браузер и врал «включено».
// Браузерные API (window/navigator/Notification/fetch) стабятся: vitest здесь
// в environment "node", реального DOM нет.

import {
  disablePush,
  enablePush,
  resolvePushState
} from "@/features/notifications/use-push-subscription";

const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";
const KEYS = { p256dh: "p256dh-key", auth: "auth-key" };
const VAPID_PUBLIC_KEY = "dGVzdC1rZXk";

type SubscriptionStub = {
  endpoint: string;
  toJSON: () => { endpoint: string; keys: { p256dh: string; auth: string } };
  unsubscribe: () => Promise<boolean>;
};

const browserSubscription = (): SubscriptionStub => ({
  endpoint: ENDPOINT,
  toJSON: () => ({ endpoint: ENDPOINT, keys: KEYS }),
  unsubscribe: vi.fn(async () => true)
});

type Scenario = {
  /** Живая подписка в браузере (переживает удаление строки в БД). */
  subscription: SubscriptionStub | null;
  /** Ответ сервера про эту подписку: true/false — знает/не знает, "fail" — не ответил. */
  server: boolean | "fail";
  permission?: NotificationPermission;
  publicKey?: string | null;
};

const subscribeCalls: Array<Record<string, unknown>> = [];
const unsubscribeCalls: Array<Record<string, unknown>> = [];
const fetchedUrls: string[] = [];
const pushManagerSubscribe = vi.fn();

function setupBrowser(scenario: Scenario): void {
  const {
    subscription,
    server,
    permission = "granted",
    publicKey = VAPID_PUBLIC_KEY
  } = scenario;

  const pushManager = {
    getSubscription: vi.fn(async () => subscription),
    subscribe: pushManagerSubscribe.mockImplementation(async () => browserSubscription())
  };
  const registration = { pushManager };

  vi.stubGlobal("window", { PushManager: class {}, Notification: class {} });
  vi.stubGlobal("navigator", {
    userAgent: "Mozilla/5.0 (Test)",
    serviceWorker: {
      getRegistration: vi.fn(async () => registration),
      register: vi.fn(async () => registration),
      ready: Promise.resolve(registration)
    }
  });
  vi.stubGlobal("Notification", {
    permission,
    requestPermission: vi.fn(async () => permission)
  });

  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: { body?: string }) => {
      fetchedUrls.push(url);

      if (url.startsWith("/api/notifications/public-key")) {
        return { ok: true, json: async () => ({ publicKey }) };
      }
      if (url.startsWith("/api/notifications/subscription")) {
        if (server === "fail") return { ok: false, json: async () => ({}) };
        return { ok: true, json: async () => ({ subscribed: server }) };
      }
      if (url.startsWith("/api/notifications/subscribe")) {
        subscribeCalls.push(JSON.parse(init?.body ?? "{}"));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      if (url.startsWith("/api/notifications/unsubscribe")) {
        unsubscribeCalls.push(JSON.parse(init?.body ?? "{}"));
        return { ok: true, json: async () => ({ ok: true }) };
      }
      throw new Error(`unexpected fetch: ${url}`);
    })
  );
}

beforeEach(() => {
  subscribeCalls.length = 0;
  unsubscribeCalls.length = 0;
  fetchedUrls.length = 0;
  pushManagerSubscribe.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolvePushState — сервер как источник истины", () => {
  it("сервер не знает подписку → «выключено», хотя браузерная подписка жива", async () => {
    setupBrowser({ subscription: browserSubscription(), server: false });

    await expect(resolvePushState()).resolves.toBe("default");
  });

  it("сервер знает подписку → «включено»", async () => {
    setupBrowser({ subscription: browserSubscription(), server: true });

    await expect(resolvePushState()).resolves.toBe("subscribed");
  });

  it("в браузере подписки нет → «выключено», сервер не спрашиваем", async () => {
    setupBrowser({ subscription: null, server: true });

    await expect(resolvePushState()).resolves.toBe("default");
    expect(fetchedUrls.some((url) => url.startsWith("/api/notifications/subscription"))).toBe(false);
  });

  it("сервер не ответил (офлайн) → верим браузеру, тумблер не мигает", async () => {
    setupBrowser({ subscription: browserSubscription(), server: "fail" });

    await expect(resolvePushState()).resolves.toBe("subscribed");
  });

  it("спрашивает сервер именно про endpoint этого браузера", async () => {
    setupBrowser({ subscription: browserSubscription(), server: true });

    await resolvePushState();

    expect(fetchedUrls).toContain(
      `/api/notifications/subscription?endpoint=${encodeURIComponent(ENDPOINT)}`
    );
  });

  it("запрет в браузере и сервер без VAPID остаются как были", async () => {
    setupBrowser({ subscription: null, server: false, permission: "denied" });
    await expect(resolvePushState()).resolves.toBe("denied");

    vi.unstubAllGlobals();
    setupBrowser({ subscription: null, server: false, publicKey: null });
    await expect(resolvePushState()).resolves.toBe("unconfigured");
  });
});

describe("enablePush — включение возвращает подписку на сервер", () => {
  it("переиспользует живую браузерную подписку и заново регистрирует её в БД", async () => {
    setupBrowser({ subscription: browserSubscription(), server: false });

    await expect(enablePush()).resolves.toEqual({ state: "subscribed" });

    expect(subscribeCalls).toHaveLength(1);
    expect(subscribeCalls[0]).toMatchObject({ endpoint: ENDPOINT, keys: KEYS });
    // Новую подписку в браузере не заводим: у живой те же ключи, их и возвращаем.
    expect(pushManagerSubscribe).not.toHaveBeenCalled();
  });

  it("без подписки в браузере — заводит новую и отправляет на сервер", async () => {
    setupBrowser({ subscription: null, server: false });

    await expect(enablePush()).resolves.toEqual({ state: "subscribed" });

    expect(pushManagerSubscribe).toHaveBeenCalledTimes(1);
    expect(subscribeCalls[0]).toMatchObject({ endpoint: ENDPOINT, keys: KEYS });
  });

  it("отказ в разрешении не трогает сервер", async () => {
    setupBrowser({ subscription: null, server: false, permission: "denied" });

    await expect(enablePush()).resolves.toEqual({ state: "denied" });
    expect(subscribeCalls).toHaveLength(0);
  });
});

describe("disablePush", () => {
  it("отписывает браузер и удаляет строку на сервере", async () => {
    setupBrowser({ subscription: browserSubscription(), server: true });

    await expect(disablePush()).resolves.toEqual({ state: "default" });
    expect(unsubscribeCalls[0]).toEqual({ endpoint: ENDPOINT });
  });
});
