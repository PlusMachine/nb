import { beforeEach, describe, expect, it, vi } from "vitest";

// Гейты блокировки в @nb/auth: заблокированный не входит НИ ОДНИМ путём и не
// «перерегистрируется» по своему же e-mail/телефону, обезличивание вычищает ПДн
// и OAuth-привязки. БД подменена памятью: проверяется логика сервиса, а не SQL.

type Row = Record<string, unknown>;

type ColumnRef = { table: string; name: string };

type Clause =
  | { op: "eq"; column: ColumnRef; value: unknown }
  | { op: "gt"; column: ColumnRef; value: unknown }
  | { op: "isNull"; column: ColumnRef }
  | { op: "and"; args: Clause[] }
  | { op: "or"; args: Clause[] };

const { state } = vi.hoisted(() => ({
  state: {
    tables: {} as Record<string, Row[]>,
    nextId: 0,
    locks: [] as string[],
    failDelete: null as string | null
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
    if (clause.op === "isNull") return left === null || left === undefined;
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
        for: () => { state.locks.push(baseTable); return builder; },
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

  let transactionTail: Promise<unknown> = Promise.resolve();
  const db = {
    // Тесты конкурентных операций одного users.id: FOR UPDATE сериализует их
    // в Postgres. Модель также откатывает записи при ошибке внутри транзакции.
    transaction: <T>(callback: (executor: unknown) => Promise<T>): Promise<T> => {
      const result = transactionTail.then(async () => {
        const snapshot = structuredClone(state.tables);
        try { return await callback(db); }
        catch (error) { state.tables = snapshot; throw error; }
      });
      transactionTail = result.catch(() => {});
      return result;
    },
    select: (projection?: Record<string, unknown>) => selectBuilder(projection),
    insert: (table: { __table: string }) => ({
      values: (values: Row) => {
        state.nextId += 1;
        const row: Row = {
          id: `${table.__table}-${state.nextId}`, createdAt: new Date(), updatedAt: new Date(),
          blockedAt: null, anonymizedAt: null, passwordHash: null, usedAt: null, attempts: 0,
          ...values
        };
        rowsOf(table.__table).push(row);
        const result = {
          returning: () => Promise.resolve([{ ...row }]),
          onConflictDoUpdate: () => ({ returning: () => Promise.resolve([{ ...row }]) }),
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
        if (state.failDelete === table.__table) throw new Error("TEST_DB_FAILURE");
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
    isNull: (column: unknown) => ({ op: "isNull", column }),
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
  consumePhoneVerification,
  consumeVerification,
  createPasswordSession,
  getUserBySessionToken,
  hashPassword,
  hashToken,
  issuePhoneVerification,
  issueVerification,
  linkOAuthAccount,
  setPassword,
  resetPasswordWithVerification,
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
  state.locks = [];
  state.failDelete = null;

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

    await expect(setPassword({ email: EMAIL, password: "новый длинный пароль" })).rejects.toThrow(ACCOUNT_BLOCKED_ERROR);
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

describe("защита подтверждения почты и смены пароля", () => {
  it.each(["oauth-new", "oauth-linked", "email"])("%s: первый подтвержденный вход отзывает неподтвержденные пароль, сессии и push", async (method) => {
    user().emailVerified = false;
    const confirmed = method === "email"
      ? await completeEmailSignIn({ email: EMAIL })
      : await linkOAuthAccount({ provider: method === "oauth-linked" ? "vk" : "yandex", providerAccountId: method === "oauth-linked" ? "vk-42" : "ya-new", email: EMAIL });

    expect(confirmed).toMatchObject({ id: "user-1", emailVerified: true });
    expect(user().passwordHash).toBeNull();
    await expect(signInWithPassword({ email: EMAIL, password: PASSWORD })).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(getUserBySessionToken(SESSION_TOKEN)).resolves.toBeNull();
    expect(rows("pushSubscriptions").map(row => row.id)).toEqual(["push-2"]);
    expect(rows("verifications").filter(row => row.email === EMAIL)).toHaveLength(0);
    expect(state.locks).toContain("users");
  });

  it("повторный подтвержденный вход сохраняет установленный владельцем пароль и другие сессии", async () => {
    const before = user().passwordHash;
    await completeEmailSignIn({ email: EMAIL });
    await linkOAuthAccount({ provider: "yandex", providerAccountId: "ya-new", email: EMAIL });
    expect(user().passwordHash).toBe(before);
    await expect(getUserBySessionToken(SESSION_TOKEN)).resolves.toMatchObject({ id: "user-1" });
  });

  it("сброс меняет пароль, подтверждает email и отзывает старые сессии, push и все email-токены", async () => {
    user().emailVerified = false;
    const verification = await issueVerification({ email: EMAIL, type: "password_reset" });
    await issueVerification({ email: EMAIL, type: "magic_link" });
    const password = "new password chosen by owner";
    const { session } = await resetPasswordWithVerification({ email: EMAIL, token: verification.rawToken, password });
    await expect(signInWithPassword({ email: EMAIL, password })).resolves.toMatchObject({ emailVerified: true });
    await expect(signInWithPassword({ email: EMAIL, password: PASSWORD })).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(getUserBySessionToken(SESSION_TOKEN)).resolves.toBeNull();
    await expect(getUserBySessionToken(session.rawToken)).resolves.toMatchObject({ id: "user-1" });
    expect(rows("sessions")).toHaveLength(1);
    expect(rows("verifications").filter(row => row.email === EMAIL)).toHaveLength(0);
    expect(rows("pushSubscriptions").map(row => row.id)).toEqual(["push-2"]);
    expect(state.locks).toContain("users");
  });

  it("неверный reset-токен не меняет пароль или сессии", async () => {
    const before = user().passwordHash;
    await expect(resetPasswordWithVerification({ email: EMAIL, token: "wrong", password: "new password chosen by owner" })).rejects.toThrow("INVALID_TOKEN");
    expect(user().passwordHash).toBe(before);
    await expect(getUserBySessionToken(SESSION_TOKEN)).resolves.toMatchObject({ id: "user-1" });
  });

  it("короткий новый пароль не расходует действующий reset-токен", async () => {
    const verification = await issueVerification({ email: EMAIL, type: "password_reset" });
    await expect(resetPasswordWithVerification({ email: EMAIL, token: verification.rawToken, password: "short" })).rejects.toThrow("INVALID_PASSWORD");
    await expect(resetPasswordWithVerification({ email: EMAIL, token: verification.rawToken, password: "new password chosen by owner" })).resolves.toMatchObject({ user: { id: "user-1" } });
  });

  it("ошибка отзыва сессий откатывает пароль и потребление reset-токена вместе", async () => {
    const before = user().passwordHash;
    const verification = await issueVerification({ email: EMAIL, type: "password_reset" });
    state.failDelete = "sessions";
    await expect(resetPasswordWithVerification({ email: EMAIL, token: verification.rawToken, password: "new password chosen by owner" })).rejects.toThrow("TEST_DB_FAILURE");
    expect(user().passwordHash).toBe(before);
    expect(rows("verifications").find(row => row.codeHash === hashToken(verification.rawToken))?.usedAt).toBeNull();
    expect(rows("sessions")).toHaveLength(1);
  });

  it("параллельный вход старым паролем не переживает первое подтверждение email", async () => {
    user().emailVerified = false;
    const [login] = await Promise.allSettled([
      createPasswordSession({ email: EMAIL, password: PASSWORD }),
      completeEmailSignIn({ email: EMAIL })
    ]);
    if (login.status === "fulfilled") {
      await expect(getUserBySessionToken(login.value.rawToken)).resolves.toBeNull();
    }
    expect(rows("sessions")).toHaveLength(0);
    expect(state.locks.filter(table => table === "users")).toHaveLength(2);
  });
});

describe("одноразовое потребление токенов", () => {
  it.each(["otp", "magic_link", "password_reset"] as const)("%s: только один из параллельных запросов принимает токен", async (type) => {
    const verification = await issueVerification({ email: EMAIL, type });
    const results = await Promise.allSettled([
      consumeVerification({ email: EMAIL, type, token: verification.rawToken }),
      consumeVerification({ email: EMAIL, type, token: verification.rawToken })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });

  it("просроченный токен не принимается и не расходуется", async () => {
    const verification = await issueVerification({ email: EMAIL, type: "otp" });
    const row = rows("verifications").find(row => row.codeHash === hashToken(verification.rawToken))!;
    row.expiresAt = new Date(Date.now() - 1000);
    await expect(consumeVerification({ email: EMAIL, type: "otp", token: verification.rawToken })).rejects.toThrow("INVALID_TOKEN");
    expect(row.usedAt).toBeNull();
  });

  it("SMS: только один из параллельных запросов принимает код", async () => {
    const verification = await issuePhoneVerification({ phone: PHONE });
    const results = await Promise.allSettled([
      consumePhoneVerification({ phone: PHONE, code: verification.rawToken }),
      consumePhoneVerification({ phone: PHONE, code: verification.rawToken })
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  });
});
