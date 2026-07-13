import { beforeEach, describe, expect, it, vi } from "vitest";

// Инвариант «в системе всегда остаётся живой администратор». Проверка и запись
// обязаны идти в ОДНОЙ транзакции на строках, взятых `for update`: отдельный
// count(*) до мутации — это TOCTOU, и два параллельных запроса разжалуют друг
// друга досуха. Гонка воспроизводится хуком onLock: он правит таблицу ровно в
// момент захвата блокировки — так же, как параллельная транзакция, коммит которой
// мы дождались, стоя на `for update`.

vi.mock("server-only", () => ({}));

type Row = Record<string, unknown>;
type ColumnRef = { __column: true; table: string; name: string };
type Clause =
  | { op: "eq"; column: ColumnRef; value: unknown }
  | { op: "isNull"; column: ColumnRef }
  | { op: "and"; args: Clause[] }
  | { op: "or"; args: Clause[] };

const { state } = vi.hoisted(() => ({
  state: {
    users: [] as Row[],
    /** Параллельная транзакция, коммит которой мы «застали», сняв блокировку. */
    onLock: null as null | (() => void),
    lockedFor: [] as string[],
    tx: null as unknown,
    committed: 0,
    rolledBack: 0
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
    ) as unknown as Record<string, ColumnRef> & { __table: string };

  const valueOf = (row: Row, column: ColumnRef) => row[column.name] ?? null;

  const matches = (row: Row, clause: Clause | undefined): boolean => {
    if (!clause) {
      return true;
    }
    switch (clause.op) {
      case "eq":
        return valueOf(row, clause.column) === clause.value;
      case "isNull":
        return valueOf(row, clause.column) === null;
      case "and":
        return clause.args.every((arg) => matches(row, arg));
      case "or":
        return clause.args.some((arg) => matches(row, arg));
      default:
        return false;
    }
  };

  // Строки считаются в момент await — то есть уже ПОСЛЕ `for update`, как в Postgres,
  // который перечитывает строку после захвата блокировки.
  const selectBuilder = (projection?: Record<string, ColumnRef>) => {
    let where: Clause | undefined;

    const resolve = () =>
      state.users
        .filter((row) => matches(row, where))
        .sort((a, b) => String(a.id).localeCompare(String(b.id)))
        .map((row) => {
          if (!projection) {
            return { ...row };
          }
          const projected: Row = {};
          for (const [alias, column] of Object.entries(projection)) {
            projected[alias] = valueOf(row, column);
          }
          return projected;
        });

    const builder = {
      from: () => builder,
      where: (clause: Clause) => {
        where = clause;
        return builder;
      },
      orderBy: () => builder,
      limit: () => builder,
      offset: () => builder,
      for: (strength: string) => {
        state.lockedFor.push(strength);
        state.onLock?.();
        state.onLock = null;
        return builder;
      },
      then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
        Promise.resolve(resolve()).then(onFulfilled, onRejected)
    };

    return builder;
  };

  const executor = {
    select: (projection?: Record<string, ColumnRef>) => selectBuilder(projection),
    update: () => ({ set: () => ({ where: () => ({ returning: () => Promise.resolve([]) }) }) }),
    delete: () => ({ where: () => Promise.resolve() })
  };

  const db = {
    ...executor,
    transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
      const tx = { ...executor, __tx: true };
      state.tx = tx;
      try {
        const result = await callback(tx);
        state.committed += 1;
        return result;
      } catch (error) {
        state.rolledBack += 1;
        throw error;
      }
    }
  };

  return {
    db,
    users: tableToken("users"),
    recipes: tableToken("recipes"),
    brewBatches: tableToken("brewBatches"),
    brewDevices: tableToken("brewDevices"),
    masterProfiles: tableToken("masterProfiles"),
    userIngredients: tableToken("userIngredients"),
    and: (...args: Clause[]) => ({ op: "and", args }),
    or: (...args: Clause[]) => ({ op: "or", args }),
    eq: (column: ColumnRef, value: unknown) => ({ op: "eq", column, value }),
    isNull: (column: ColumnRef) => ({ op: "isNull", column }),
    isNotNull: (column: ColumnRef) => ({ op: "isNotNull", column }),
    ilike: () => ({ op: "ilike" }),
    inArray: () => ({ op: "inArray" }),
    asc: (column: ColumnRef) => column,
    desc: (column: ColumnRef) => column,
    count: () => ({ op: "count" }),
    sql: () => ({ op: "sql" })
  };
});

const mocks = vi.hoisted(() => ({
  setRole: vi.fn(),
  blockUser: vi.fn(),
  anonymizeUser: vi.fn(),
  recordAuditEvent: vi.fn(),
  scrubActorEmails: vi.fn(),
  unlistMasterProfileForUser: vi.fn(),
  purgeMasterProfileForUser: vi.fn()
}));

// Мутаторы @nb/auth подменены: проверяем, что они (а) вообще вызваны только при
// разрешённом действии и (б) получили ИМЕННО tx, а не глобальный db.
vi.mock("@nb/auth", () => ({
  ROLES: ["user", "editor", "moderator", "admin"],
  setRole: mocks.setRole,
  blockUser: mocks.blockUser,
  anonymizeUser: mocks.anonymizeUser
}));
vi.mock("@/features/audit/service", () => ({
  recordAuditEvent: mocks.recordAuditEvent,
  scrubActorEmails: mocks.scrubActorEmails
}));
vi.mock("@/features/masters/service", () => ({
  unlistMasterProfileForUser: mocks.unlistMasterProfileForUser,
  purgeMasterProfileForUser: mocks.purgeMasterProfileForUser
}));

import { anonymizeUserAccount, blockUserAccount, changeUserRole } from "../features/admin-users/service";

const ACTOR = "11111111-1111-4111-8111-111111111111";
const TARGET = "22222222-2222-4222-8222-222222222222";
const OUTSIDER = "33333333-3333-4333-8333-333333333333";

const actor = { id: ACTOR, email: "admin@mail.ru" };

const adminRow = (id: string, email: string): Row => ({
  id,
  email,
  phone: null,
  role: "admin",
  displayName: "Админ",
  blockedAt: null,
  anonymizedAt: null
});

/** Параллельная транзакция успела разжаловать второго админа, пока мы ждали блокировку. */
const otherAdminDemotedDuringLock = () => {
  state.onLock = () => {
    const row = state.users.find((item) => item.id === ACTOR);
    if (row) {
      row.role = "user";
    }
  };
};

beforeEach(() => {
  Object.values(mocks).forEach((mock) => mock.mockReset());
  mocks.unlistMasterProfileForUser.mockResolvedValue(null);
  mocks.purgeMasterProfileForUser.mockResolvedValue(null);

  state.users = [adminRow(ACTOR, "admin@mail.ru"), adminRow(TARGET, "second@mail.ru")];
  state.onLock = null;
  state.lockedFor = [];
  state.tx = null;
  state.committed = 0;
  state.rolledBack = 0;
});

describe("смена роли: проверка и запись в одной транзакции", () => {
  it("берёт строки под `for update` и пишет тем же tx, что и проверял", async () => {
    await changeUserRole({ actor, userId: TARGET, role: "editor" });

    expect(state.lockedFor).toEqual(["update"]);
    expect(mocks.setRole).toHaveBeenCalledWith({ userId: TARGET, role: "editor" }, state.tx);
    expect(state.committed).toBe(1);
    expect(mocks.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.role_change", entityId: TARGET })
    );
  });

  it("гонка: второго админа разжаловали, пока мы ждали блокировку — цель уже последняя", async () => {
    otherAdminDemotedDuringLock();

    await expect(changeUserRole({ actor, userId: TARGET, role: "user" })).rejects.toThrow("LAST_ADMIN");

    // Счёт админов взят ПОСЛЕ блокировки строк, поэтому виден коммит соседа.
    expect(mocks.setRole).not.toHaveBeenCalled();
    expect(state.rolledBack).toBe(1);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("единственного администратора не разжаловать", async () => {
    state.users = [adminRow(TARGET, "second@mail.ru"), { ...adminRow(OUTSIDER, "user@mail.ru"), role: "user" }];

    await expect(changeUserRole({ actor, userId: TARGET, role: "user" })).rejects.toThrow("LAST_ADMIN");
    expect(mocks.setRole).not.toHaveBeenCalled();
  });

  it("админов двое — понижение проходит", async () => {
    await changeUserRole({ actor, userId: TARGET, role: "user" });

    expect(mocks.setRole).toHaveBeenCalledWith({ userId: TARGET, role: "user" }, state.tx);
  });
});

describe("блокировка: инвариант живого администратора", () => {
  it("гонка: последнего администратора не заблокировать", async () => {
    otherAdminDemotedDuringLock();

    await expect(blockUserAccount({ actor, userId: TARGET, reason: "спам в рецептах" })).rejects.toThrow("LAST_ADMIN");

    expect(mocks.blockUser).not.toHaveBeenCalled();
    expect(mocks.unlistMasterProfileForUser).not.toHaveBeenCalled();
    expect(state.rolledBack).toBe(1);
  });

  it("разрешённая блокировка пишется тем же tx", async () => {
    await blockUserAccount({ actor, userId: TARGET, reason: "  спам в рецептах  " });

    expect(mocks.blockUser).toHaveBeenCalledWith(
      { userId: TARGET, reason: "спам в рецептах", byUserId: ACTOR },
      state.tx
    );
    expect(state.committed).toBe(1);
  });

  it("состояние цели тоже читается под блокировкой: повторную блокировку отбивает", async () => {
    // Пока ждали блокировку, соседняя транзакция уже забанила цель.
    state.onLock = () => {
      const row = state.users.find((item) => item.id === TARGET);
      if (row) {
        row.blockedAt = new Date();
      }
    };

    await expect(blockUserAccount({ actor, userId: TARGET, reason: "спам в рецептах" })).rejects.toThrow(
      "ALREADY_BLOCKED"
    );
    expect(mocks.blockUser).not.toHaveBeenCalled();
  });
});

describe("обезличивание: инвариант живого администратора", () => {
  it("гонка: последнего администратора не обезличить", async () => {
    otherAdminDemotedDuringLock();

    await expect(
      anonymizeUserAccount({ actor, userId: TARGET, confirmation: "second@mail.ru" })
    ).rejects.toThrow("LAST_ADMIN");

    expect(mocks.anonymizeUser).not.toHaveBeenCalled();
    expect(mocks.scrubActorEmails).not.toHaveBeenCalled();
    expect(state.rolledBack).toBe(1);
  });

  it("разрешённое обезличивание пишется тем же tx и чистит ПДн в журнале", async () => {
    await anonymizeUserAccount({ actor, userId: TARGET, confirmation: "second@mail.ru" });

    expect(mocks.anonymizeUser).toHaveBeenCalledWith({ userId: TARGET, byUserId: ACTOR }, state.tx);
    expect(state.committed).toBe(1);
  });
});

// ПДн обезличенного лежат в трёх таблицах: users, system_events.actor_email и
// master_profiles (контакты + опубликованный снапшот). Пройди чистки отдельными
// записями ПОСЛЕ коммита — их падение оставило бы аккаунт обезличенным, а почту в
// журнале и контакты мастера живыми: ровно та утечка, ради которой обезличивание и
// делается. Инвариант: либо обезличено всё разом, либо ничего.
describe("обезличивание: ПДн чистятся одной транзакцией", () => {
  it("журнал и витрина чистятся тем же tx, что и users", async () => {
    await anonymizeUserAccount({ actor, userId: TARGET, confirmation: "second@mail.ru" });

    expect(mocks.scrubActorEmails).toHaveBeenCalledWith(TARGET, state.tx);
    expect(mocks.purgeMasterProfileForUser).toHaveBeenCalledWith(TARGET, state.tx);
    expect(state.committed).toBe(1);
    expect(state.rolledBack).toBe(0);
  });

  it("падение очистки журнала откатывает обезличивание целиком", async () => {
    mocks.scrubActorEmails.mockRejectedValue(new Error("audit db down"));

    await expect(
      anonymizeUserAccount({ actor, userId: TARGET, confirmation: "second@mail.ru" })
    ).rejects.toThrow("audit db down");

    expect(state.rolledBack).toBe(1);
    expect(state.committed).toBe(0);
    // Витрину не тронули, и события «аккаунт обезличен» в журнале нет: снаружи
    // транзакции ничего не произошло.
    expect(mocks.purgeMasterProfileForUser).not.toHaveBeenCalled();
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("падение очистки витрины откатывает обезличивание целиком", async () => {
    mocks.purgeMasterProfileForUser.mockRejectedValue(new Error("masters db down"));

    await expect(
      anonymizeUserAccount({ actor, userId: TARGET, confirmation: "second@mail.ru" })
    ).rejects.toThrow("masters db down");

    expect(state.rolledBack).toBe(1);
    expect(state.committed).toBe(0);
    expect(mocks.recordAuditEvent).not.toHaveBeenCalled();
  });
});

describe("несуществующая цель", () => {
  it("неизвестный id — USER_NOT_FOUND без записи", async () => {
    await expect(changeUserRole({ actor, userId: OUTSIDER, role: "editor" })).rejects.toThrow("USER_NOT_FOUND");
    expect(mocks.setRole).not.toHaveBeenCalled();
  });

  it("мусор вместо uuid не доезжает до SQL", async () => {
    await expect(changeUserRole({ actor, userId: "не-uuid", role: "editor" })).rejects.toThrow("USER_NOT_FOUND");
    expect(state.lockedFor).toEqual([]);
  });
});
