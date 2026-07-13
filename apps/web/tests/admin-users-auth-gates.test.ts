import { beforeEach, describe, expect, it, vi } from "vitest";

// Гейты блокировки в @nb/auth: заблокированный не входит НИ ОДНИМ путём и не
// «перерегистрируется» по своему же e-mail/телефону, обезличивание вычищает ПДн
// и OAuth-привязки. БД подменена памятью: проверяется логика сервиса, а не SQL.

type Row = Record<string, unknown>;

type ColumnRef = { table: string; name: string };

type Clause =
  | { op: "eq"; column: ColumnRef; value: unknown }
  | { op: "gt"; column: ColumnRef; value: unknown }
  | { op: "and"; args: Clause[] }
  | { op: "or"; args: Clause[] };

const { state } = vi.hoisted(() => ({
  state: {
    tables: {} as Record<string, Row[]>,
    nextId: 0
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get: (_target, prop) => {
          const key = String(prop);
          if (key === "__table") {
            return name;
          }
          return { __column: true, table: name, name: key };
        }
      }
    ) as unknown as Record<string, { __column: true; table: string; name: string }> & { __table: string };

  const isTable = (value: unknown): value is { __table: string } =>
    typeof value === "object" && value !== null && "__table" in (value as Record<string, unknown>);

  const isColumn = (value: unknown): value is { table: string; name: string } =>
    typeof value === "object" && value !== null && "__column" in (value as Record<string, unknown>);

  const rowsOf = (table: string): Row[] => (state.tables[table] ??= []);

  // Строка «в работе» — карта таблица → запись (чтобы пережить innerJoin).
  type WorkRow = Record<string, Row>;

  const matches = (work: WorkRow, clause: Clause | undefined): boolean => {
    if (!clause) {
      return true;
    }
    if (clause.op === "and") {
      return clause.args.every((arg) => matches(work, arg));
    }
    if (clause.op === "or") {
      return clause.args.some((arg) => matches(work, arg));
    }

    const row = work[clause.column.table];
    if (!row) {
      return false;
    }
    const left = row[clause.column.name];
    // В ON-условии innerJoin справа стоит КОЛОНКА, а не литерал (sessions.user_id = users.id).
    const right = isColumn(clause.value) ? work[clause.value.table]?.[clause.value.name] : clause.value;
    if (clause.op === "gt") {
      return (left as Date) > (right as Date);
    }
    return left === right;
  };

  const selectBuilder = (projection?: Record<string, unknown>) => {
    let baseTable = "";
    let work: WorkRow[] = [];
    let where: Clause | undefined;

    const builder: Record<string, unknown> = {
      from: (table: { __table: string }) => {
        baseTable = table.__table;
        work = rowsOf(baseTable).map((row) => ({ [baseTable]: row }));
        return builder;
      },
      innerJoin: (table: { __table: string }, on: Clause) => {
        const joinTable = table.__table;
        work = work.flatMap((item) => {
          const joined = rowsOf(joinTable)
            .map((row) => ({ ...item, [joinTable]: row }))
            .filter((candidate) => matches(candidate, on));
          return joined;
        });
        return builder;
      },
      where: (clause: Clause) => {
        where = clause;
        return builder;
      },
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const filtered = work.filter((item) => matches(item, where));
        const rows = filtered.map((item) => {
          if (!projection) {
            return { ...item[baseTable] };
          }
          const row: Row = {};
          for (const [alias, source] of Object.entries(projection)) {
            if (isTable(source)) {
              row[alias] = { ...item[source.__table] };
            } else if (isColumn(source)) {
              row[alias] = item[source.table]?.[source.name] ?? null;
            }
          }
          return row;
        });
        return Promise.resolve(rows).then(onFulfilled, onRejected);
      }
    };

    return builder;
  };

  const db = {
    select: (projection?: Record<string, unknown>) => selectBuilder(projection),
    insert: (table: { __table: string }) => ({
      values: (values: Row) => {
        state.nextId += 1;
        const row: Row = { id: `${table.__table}-${state.nextId}`, createdAt: new Date(), updatedAt: new Date(), ...values };
        rowsOf(table.__table).push(row);
        const result = {
          returning: () => Promise.resolve([{ ...row }]),
          onConflictDoUpdate: () => Promise.resolve(),
          then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(undefined).then(onFulfilled)
        };
        return result;
      }
    }),
    update: (table: { __table: string }) => ({
      set: (values: Row) => ({
        where: (clause: Clause) => {
          const updated: Row[] = [];
          for (const row of rowsOf(table.__table)) {
            if (matches({ [table.__table]: row }, clause)) {
              Object.assign(row, values);
              updated.push({ ...row });
            }
          }
          const result = {
            returning: () => Promise.resolve(updated),
            then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(undefined).then(onFulfilled)
          };
          return result;
        }
      })
    }),
    delete: (table: { __table: string }) => ({
      where: (clause: Clause) => {
        state.tables[table.__table] = rowsOf(table.__table).filter(
          (row) => !matches({ [table.__table]: row }, clause)
        );
        return Promise.resolve();
      }
    })
  };

  return {
    db,
    users: tableToken("users"),
    sessions: tableToken("sessions"),
    accounts: tableToken("accounts"),
    verifications: tableToken("verifications"),
    authRateLimits: tableToken("authRateLimits"),
    pushSubscriptions: tableToken("pushSubscriptions"),
    and: (...args: Clause[]) => ({ op: "and", args }),
    or: (...args: Clause[]) => ({ op: "or", args }),
    eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
    gt: (column: unknown, value: unknown) => ({ op: "gt", column, value }),
    sql: () => ({ op: "sql" })
  };
});

import {
  ACCOUNT_BLOCKED_ERROR,
  ANONYMIZED_DISPLAY_NAME,
  anonymizeUser,
  blockUser,
  completeEmailSignIn,
  completePhoneSignIn,
  getUserBySessionToken,
  hashPassword,
  hashToken,
  linkOAuthAccount,
  setPassword,
  signInWithPassword,
  unblockUser
} from "@nb/auth";

const EMAIL = "brewer@mail.ru";
const PHONE = "+79990001122";
const PASSWORD = "correct horse";
const SESSION_TOKEN = "raw-session-token";

const rows = (table: string) => (state.tables[table] ??= []);
const user = () => rows("users")[0] as Row;

beforeEach(async () => {
  state.tables = {};
  state.nextId = 0;

  rows("users").push({
    id: "user-1",
    email: EMAIL,
    emailVerified: true,
    phone: PHONE,
    phoneVerified: true,
    displayName: "Пивовар",
    preferredCurrency: "RUB",
    preferredGravityUnit: "plato",
    image: "https://example.test/avatar.png",
    role: "user",
    passwordHash: await hashPassword(PASSWORD),
    blockedAt: null,
    blockedReason: null,
    blockedByUserId: null,
    anonymizedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z")
  });

  rows("sessions").push({
    id: "session-1",
    userId: "user-1",
    tokenHash: hashToken(SESSION_TOKEN),
    expiresAt: new Date(Date.now() + 60_000)
  });

  rows("accounts").push({ id: "account-1", userId: "user-1", provider: "vk", providerAccountId: "vk-42" });
  rows("verifications").push({ id: "verification-1", email: EMAIL, phone: null, type: "otp" });
  rows("verifications").push({ id: "verification-2", email: null, phone: PHONE, type: "sms_otp" });
  rows("authRateLimits").push({ id: "limit-1", key: EMAIL, action: "otp", count: 1 });

  rows("pushSubscriptions").push({
    id: "push-1",
    userId: "user-1",
    endpoint: "https://fcm.googleapis.com/fcm/send/brewer-device",
    p256dh: "p256dh-key",
    auth: "auth-key",
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0"
  });
  rows("pushSubscriptions").push({
    id: "push-2",
    userId: "user-2",
    endpoint: "https://fcm.googleapis.com/fcm/send/other-device",
    p256dh: "p256dh-key",
    auth: "auth-key",
    userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1"
  });
});

describe("блокировка", () => {
  it("гасит все сессии пользователя", async () => {
    expect(rows("sessions")).toHaveLength(1);

    await blockUser({ userId: "user-1", reason: "  спам в рецептах  ", byUserId: "admin-1" });

    expect(rows("sessions")).toHaveLength(0);
    expect(user().blockedAt).toBeInstanceOf(Date);
    expect(user().blockedReason).toBe("спам в рецептах");
    expect(user().blockedByUserId).toBe("admin-1");
  });

  it("снимает push-подписки: забаненному уведомления не летят", async () => {
    await blockUser({ userId: "user-1", reason: "спам", byUserId: "admin-1" });

    // Подписка живёт в браузере отдельно от сессии — гашение сессий её не трогает.
    expect(rows("pushSubscriptions").map((row) => row.id)).toEqual(["push-2"]);
  });

  it("живая кука забаненного больше не авторизует", async () => {
    await expect(getUserBySessionToken(SESSION_TOKEN)).resolves.toMatchObject({ id: "user-1" });

    // Сессию не гасим — проверяем именно гейт в getUserBySessionToken.
    user().blockedAt = new Date();

    await expect(getUserBySessionToken(SESSION_TOKEN)).resolves.toBeNull();
  });

  it("не пускает по паролю", async () => {
    await expect(signInWithPassword({ email: EMAIL, password: PASSWORD })).resolves.toMatchObject({ id: "user-1" });

    await blockUser({ userId: "user-1", reason: "спам", byUserId: "admin-1" });

    await expect(signInWithPassword({ email: EMAIL, password: PASSWORD })).rejects.toThrow(ACCOUNT_BLOCKED_ERROR);
    // Неверный пароль по-прежнему неверный пароль: факт блокировки не раскрываем.
    await expect(signInWithPassword({ email: EMAIL, password: "нет" })).rejects.toThrow("INVALID_CREDENTIALS");
  });

  it("не пускает по e-mail OTP и не создаёт дубль аккаунта", async () => {
    await blockUser({ userId: "user-1", reason: "спам", byUserId: "admin-1" });

    await expect(completeEmailSignIn({ email: EMAIL })).rejects.toThrow(ACCOUNT_BLOCKED_ERROR);
    expect(rows("users")).toHaveLength(1);
  });

  it("не пускает по SMS OTP", async () => {
    await blockUser({ userId: "user-1", reason: "спам", byUserId: "admin-1" });

    await expect(completePhoneSignIn({ phone: PHONE })).rejects.toThrow(ACCOUNT_BLOCKED_ERROR);
    expect(rows("users")).toHaveLength(1);
  });

  it("не даёт перерегистрироваться через установку пароля", async () => {
    await blockUser({ userId: "user-1", reason: "спам", byUserId: "admin-1" });

    await expect(setPassword({ email: EMAIL, password: "новый пароль" })).rejects.toThrow(ACCOUNT_BLOCKED_ERROR);
    expect(rows("users")).toHaveLength(1);
  });

  it("не пускает через OAuth — ни по привязке, ни по e-mail", async () => {
    await blockUser({ userId: "user-1", reason: "спам", byUserId: "admin-1" });

    await expect(
      linkOAuthAccount({ provider: "vk", providerAccountId: "vk-42", email: EMAIL })
    ).rejects.toThrow(ACCOUNT_BLOCKED_ERROR);

    // Привязки нет, но e-mail тот же — новый аккаунт создаваться не должен.
    await expect(
      linkOAuthAccount({ provider: "yandex", providerAccountId: "ya-7", email: EMAIL })
    ).rejects.toThrow(ACCOUNT_BLOCKED_ERROR);
    expect(rows("users")).toHaveLength(1);
  });

  it("снимается и возвращает вход", async () => {
    await blockUser({ userId: "user-1", reason: "спам", byUserId: "admin-1" });
    await unblockUser({ userId: "user-1" });

    expect(user().blockedAt).toBeNull();
    expect(user().blockedReason).toBeNull();
    await expect(signInWithPassword({ email: EMAIL, password: PASSWORD })).resolves.toMatchObject({ id: "user-1" });
  });
});

describe("обезличивание", () => {
  it("стирает ПДн, гасит сессии и сносит OAuth-привязки", async () => {
    await anonymizeUser({ userId: "user-1", byUserId: "admin-1" });

    expect(user().email).toBeNull();
    expect(user().phone).toBeNull();
    expect(user().passwordHash).toBeNull();
    expect(user().image).toBeNull();
    expect(user().displayName).toBe(ANONYMIZED_DISPLAY_NAME);
    expect(user().emailVerified).toBe(false);
    expect(user().phoneVerified).toBe(false);
    expect(user().anonymizedAt).toBeInstanceOf(Date);
    // Без blockedAt строка осталась бы «живой» — обезличенный аккаунт заблокирован.
    expect(user().blockedAt).toBeInstanceOf(Date);

    expect(rows("sessions")).toHaveLength(0);
    expect(rows("accounts")).toHaveLength(0);
  });

  it("чистит хвосты без FK: коды подтверждения и лимиты по бывшим e-mail/телефону", async () => {
    await anonymizeUser({ userId: "user-1", byUserId: "admin-1" });

    expect(rows("verifications")).toHaveLength(0);
    expect(rows("authRateLimits")).toHaveLength(0);
  });

  it("сносит push-подписки: endpoint и User-Agent не переживают обезличивание", async () => {
    // Каскад FK тут не помощник — строка users остаётся живой.
    await anonymizeUser({ userId: "user-1", byUserId: "admin-1" });

    expect(rows("pushSubscriptions").map((row) => row.id)).toEqual(["push-2"]);
  });

  it("обезличенный аккаунт не оживает: ни куки, ни OAuth-привязка не возвращают старую строку", async () => {
    rows("sessions").push({
      id: "session-2",
      userId: "user-1",
      tokenHash: hashToken("second-token"),
      expiresAt: new Date(Date.now() + 60_000)
    });

    await anonymizeUser({ userId: "user-1", byUserId: "admin-1" });

    await expect(getUserBySessionToken(SESSION_TOKEN)).resolves.toBeNull();
    await expect(getUserBySessionToken("second-token")).resolves.toBeNull();

    // Вход через того же провайдера — это уже НОВЫЙ аккаунт: обезличенная строка
    // (её рецепты, партии, аудит) к нему не привязывается.
    const relinked = await linkOAuthAccount({ provider: "vk", providerAccountId: "vk-42", email: EMAIL });
    expect(relinked.id).not.toBe("user-1");
    expect(user().anonymizedAt).toBeInstanceOf(Date);
    expect(user().email).toBeNull();
  });
});
