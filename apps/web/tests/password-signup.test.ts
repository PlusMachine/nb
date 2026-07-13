import { beforeEach, describe, expect, it, vi } from "vitest";

// Регистрация по паролю не должна касаться уже существующего аккаунта: иначе
// POST /api/auth/password c action=signup на чужой e-mail перезаписывал бы его
// пароль и выдавал сессию. БД подменена памятью: проверяется логика сервиса.

type Row = Record<string, unknown>;

type Clause = { op: "eq"; column: { table: string; name: string }; value: unknown } | { op: "and"; args: Clause[] };

const { state } = vi.hoisted(() => ({
  state: {
    users: [] as Row[],
    nextId: 0,
    // Гонка двух регистраций: следующий insert падает уникальным индексом.
    insertError: null as (Error & { code?: string }) | null
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get: (_target, prop) => {
          const key = String(prop);
          return key === "__table" ? name : { __column: true, table: name, name: key };
        }
      }
    ) as unknown as Record<string, { __column: true; table: string; name: string }> & { __table: string };

  const matches = (row: Row, clause: Clause | undefined): boolean => {
    if (!clause) {
      return true;
    }
    if (clause.op === "and") {
      return clause.args.every((arg) => matches(row, arg));
    }
    return row[clause.column.name] === clause.value;
  };

  const db = {
    select: () => {
      let where: Clause | undefined;
      const builder: Record<string, unknown> = {
        from: () => builder,
        where: (clause: Clause) => {
          where = clause;
          return builder;
        },
        then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
          Promise.resolve(state.users.filter((row) => matches(row, where)).map((row) => ({ ...row }))).then(
            onFulfilled,
            onRejected
          )
      };
      return builder;
    },
    insert: () => ({
      values: (values: Row) => {
        const failure = state.insertError;
        state.insertError = null;
        if (failure) {
          return { returning: () => Promise.reject(failure) };
        }

        state.nextId += 1;
        const row: Row = {
          // Дефолты колонок users: без них новая строка выглядит заблокированной.
          id: `user-${state.nextId}`,
          blockedAt: null,
          blockedReason: null,
          anonymizedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...values
        };
        state.users.push(row);
        return { returning: () => Promise.resolve([{ ...row }]) };
      }
    }),
    update: () => ({
      set: (values: Row) => ({
        where: (clause: Clause) => {
          const updated: Row[] = [];
          for (const row of state.users) {
            if (matches(row, clause)) {
              Object.assign(row, values);
              updated.push({ ...row });
            }
          }
          return {
            returning: () => Promise.resolve(updated),
            then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(undefined).then(onFulfilled)
          };
        }
      })
    }),
    delete: () => ({ where: () => Promise.resolve() })
  };

  return {
    db,
    users: tableToken("users"),
    sessions: tableToken("sessions"),
    accounts: tableToken("accounts"),
    verifications: tableToken("verifications"),
    authRateLimits: tableToken("authRateLimits"),
    and: (...args: Clause[]) => ({ op: "and", args }),
    or: (...args: Clause[]) => ({ op: "or", args }),
    eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
    gt: (column: unknown, value: unknown) => ({ op: "gt", column, value }),
    sql: () => ({ op: "sql" })
  };
});

import { EMAIL_TAKEN_ERROR, hashPassword, registerWithPassword, signInWithPassword } from "@nb/auth";

const EMAIL = "brewer@mail.ru";
const PASSWORD = "correct horse";
const ATTACKER_PASSWORD = "hacked";

const victim = () => state.users[0] as Row;

const seedVictim = async (overrides: Row = {}) => {
  state.users.push({
    id: "user-1",
    email: EMAIL,
    emailVerified: true,
    phone: null,
    phoneVerified: false,
    displayName: "Пивовар",
    preferredCurrency: "RUB",
    preferredGravityUnit: "plato",
    image: null,
    role: "admin",
    passwordHash: await hashPassword(PASSWORD),
    blockedAt: null,
    blockedReason: null,
    blockedByUserId: null,
    anonymizedAt: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides
  });
};

beforeEach(() => {
  state.users = [];
  state.nextId = 0;
  state.insertError = null;
});

describe("регистрация по паролю", () => {
  it("не перезаписывает пароль существующего аккаунта", async () => {
    await seedVictim();
    const before = victim().passwordHash;

    await expect(
      registerWithPassword({ email: EMAIL, password: ATTACKER_PASSWORD })
    ).rejects.toThrow(EMAIL_TAKEN_ERROR);

    expect(victim().passwordHash).toBe(before);
    expect(state.users).toHaveLength(1);
    // Пароль атакующего не подходит, пароль владельца по-прежнему работает.
    await expect(signInWithPassword({ email: EMAIL, password: ATTACKER_PASSWORD })).rejects.toThrow("INVALID_CREDENTIALS");
    await expect(signInWithPassword({ email: EMAIL, password: PASSWORD })).resolves.toMatchObject({ id: "user-1" });
  });

  it("не проставляет пароль аккаунту без пароля (OAuth или телефон)", async () => {
    await seedVictim({ passwordHash: null });

    await expect(
      registerWithPassword({ email: EMAIL, password: ATTACKER_PASSWORD })
    ).rejects.toThrow(EMAIL_TAKEN_ERROR);

    expect(victim().passwordHash).toBeNull();
    await expect(signInWithPassword({ email: EMAIL, password: ATTACKER_PASSWORD })).rejects.toThrow("INVALID_CREDENTIALS");
  });

  it("занятость проверяется по нормализованному e-mail", async () => {
    await seedVictim();

    await expect(
      registerWithPassword({ email: "  Brewer@Mail.RU  ", password: ATTACKER_PASSWORD })
    ).rejects.toThrow(EMAIL_TAKEN_ERROR);

    expect(state.users).toHaveLength(1);
  });

  it("гонка двух регистраций: уникальный индекс тоже даёт EMAIL_TAKEN", async () => {
    const conflict: Error & { code?: string } = new Error("duplicate key value violates unique constraint");
    conflict.code = "23505";
    state.insertError = conflict;

    await expect(
      registerWithPassword({ email: EMAIL, password: ATTACKER_PASSWORD })
    ).rejects.toThrow(EMAIL_TAKEN_ERROR);
  });

  it("свободный e-mail: создаёт аккаунт с паролем и согласием", async () => {
    const created = await registerWithPassword({
      email: "Novichok@Yandex.ru",
      password: PASSWORD,
      consent: { version: "2026-01-01" }
    });

    expect(created.email).toBe("novichok@yandex.ru");
    expect(state.users).toHaveLength(1);
    expect(victim().passwordHash).toEqual(expect.any(String));
    expect(victim().consentVersion).toBe("2026-01-01");
    expect(victim().consentAcceptedAt).toBeInstanceOf(Date);

    await expect(signInWithPassword({ email: "novichok@yandex.ru", password: PASSWORD })).resolves.toMatchObject({
      id: created.id
    });
  });
});
