import { beforeEach, describe, expect, it, vi } from "vitest";

// Серверная сторона тумблера: GET /api/notifications/subscription отвечает по
// строкам push_subscriptions. Блокировка аккаунта их сносит — после разбана
// сервер обязан сказать «подписки нет», а повторное включение (POST /subscribe →
// saveSubscription) обязано вернуть строку. `@nb/db` мокается in-memory
// (по образцу tests/push-subscriptions-admin.test.ts).

vi.mock("server-only", () => ({}));

type Row = {
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
};

type Cond =
  | { kind: "eq"; col: string; value: unknown }
  | { kind: "and"; conds: Cond[] };

const { store } = vi.hoisted(() => ({ store: { rows: [] as Record<string, unknown>[] } }));

const matches = (row: Record<string, unknown>, cond?: Cond): boolean => {
  if (!cond) return true;
  if (cond.kind === "and") return cond.conds.every((inner) => matches(row, inner));
  return row[cond.col] === cond.value;
};

vi.mock("@nb/db", () => {
  const db = {
    select: () => ({
      from: () => ({
        where: (cond: Cond) => ({
          limit: async () => store.rows.filter((row) => matches(row, cond)).slice(0, 1)
        })
      })
    }),
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: async ({ set }: { set: Record<string, unknown> }) => {
          const existing = store.rows.find((row) => row.endpoint === values.endpoint);
          if (existing) {
            Object.assign(existing, set);
            return;
          }
          store.rows.push({ ...values });
        }
      })
    }),
    delete: () => ({
      where: async (cond: Cond) => {
        store.rows = store.rows.filter((row) => !matches(row, cond));
      }
    })
  };

  return {
    db,
    and: (...conds: Array<Cond | undefined>) => ({
      kind: "and",
      conds: conds.filter(Boolean) as Cond[]
    }),
    eq: (col: string, value: unknown) => ({ kind: "eq", col, value }),
    pushSubscriptions: {
      id: "id",
      userId: "userId",
      endpoint: "endpoint"
    }
  };
});

const mocks = vi.hoisted(() => ({ requireUser: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: mocks.requireUser }));

import { GET } from "../app/api/notifications/subscription/route";
import {
  hasSubscription,
  removeSubscription,
  saveSubscription
} from "@/features/notifications/service";

const USER_ID = "user-1";
const ENDPOINT = "https://fcm.googleapis.com/fcm/send/abc123";
const OTHER_ENDPOINT = "https://fcm.googleapis.com/fcm/send/other";

const subscriptionInput = (endpoint: string) => ({
  endpoint,
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
  userAgent: "Mozilla/5.0 (Test)"
});

const askServer = async (endpoint?: string): Promise<boolean> => {
  const url = endpoint
    ? `http://local/api/notifications/subscription?endpoint=${encodeURIComponent(endpoint)}`
    : "http://local/api/notifications/subscription";
  const response = await GET(new Request(url));
  const body = (await response.json()) as { subscribed: boolean };
  return body.subscribed;
};

beforeEach(() => {
  store.rows = [];
  mocks.requireUser.mockReset();
  mocks.requireUser.mockResolvedValue({ id: USER_ID });
});

describe("GET /api/notifications/subscription", () => {
  it("после сноса подписок (блокировка) отвечает «подписки нет», а повторное включение возвращает строку в БД", async () => {
    await saveSubscription(USER_ID, subscriptionInput(ENDPOINT));
    expect(await askServer(ENDPOINT)).toBe(true);

    // Блокировка аккаунта удаляет push_subscriptions; endpoint в браузере жив.
    store.rows = [];
    expect(await askServer(ENDPOINT)).toBe(false);

    // Включение тумблера = POST /subscribe с ключами живой браузерной подписки.
    await saveSubscription(USER_ID, subscriptionInput(ENDPOINT));

    expect(await askServer(ENDPOINT)).toBe(true);
    expect(store.rows).toHaveLength(1);
    expect(store.rows[0]).toMatchObject({ userId: USER_ID, endpoint: ENDPOINT });
  });

  it("подписка другого браузера не считается подпиской этого", async () => {
    await saveSubscription(USER_ID, subscriptionInput(OTHER_ENDPOINT));

    expect(await askServer(ENDPOINT)).toBe(false);
    expect(await askServer(OTHER_ENDPOINT)).toBe(true);
    // Без endpoint — «есть ли хоть одна подписка у пользователя».
    expect(await askServer()).toBe(true);
  });

  it("чужая подписка на тот же endpoint не считается своей", async () => {
    await saveSubscription("user-2", subscriptionInput(ENDPOINT));

    expect(await askServer(ENDPOINT)).toBe(false);
    expect(await hasSubscription("user-2", ENDPOINT)).toBe(true);
  });

  it("после выключения тумблера сервер отвечает «подписки нет»", async () => {
    await saveSubscription(USER_ID, subscriptionInput(ENDPOINT));
    await removeSubscription(USER_ID, ENDPOINT);

    expect(await askServer(ENDPOINT)).toBe(false);
  });
});
