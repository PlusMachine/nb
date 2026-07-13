import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type EventRow = {
  id: string;
  actorUserId: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  payload: Record<string, unknown> | null;
  createdAt: Date;
};

type UserRow = {
  id: string;
  displayName: string;
  anonymizedAt: Date | null;
};

const { mockState } = vi.hoisted(() => ({
  mockState: {
    events: [] as EventRow[],
    users: [] as UserRow[],
    insertShouldFail: false,
    nextId: 0
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, {
      get: (_t, prop) => `${name}.${String(prop)}`
    });

  const systemEventsToken = tableToken("systemEvents");
  const usersToken = tableToken("users");

  // eq(col, value) → ["eq", col, value]; and(...) → ["and", ...clauses].
  const matches = (row: EventRow, clause: unknown): boolean => {
    if (!Array.isArray(clause)) {
      return true;
    }
    const [op, ...args] = clause as [string, ...unknown[]];
    if (op === "and") {
      return args.every((arg) => matches(row, arg));
    }
    if (op === "eq") {
      const [column, value] = args;
      const field = String(column).split(".")[1] as keyof EventRow;
      return row[field] === value;
    }
    return true;
  };

  const compare = (a: EventRow, b: EventRow, orderBy: unknown[]): number => {
    for (const term of orderBy) {
      if (!Array.isArray(term)) {
        continue;
      }
      const [direction, column] = term as [string, string];
      const field = String(column).split(".")[1] as keyof EventRow;
      const left = a[field];
      const right = b[field];
      const raw = left instanceof Date && right instanceof Date
        ? left.getTime() - right.getTime()
        : String(left).localeCompare(String(right));
      if (raw !== 0) {
        return direction === "desc" ? -raw : raw;
      }
    }
    return 0;
  };

  const selectBuilder = (projection: Record<string, string>) => {
    const state = {
      joined: false,
      where: undefined as unknown,
      orderBy: [] as unknown[],
      limit: undefined as number | undefined,
      offset: 0
    };

    const builder: Record<string, unknown> = {
      from: () => builder,
      leftJoin: () => {
        state.joined = true;
        return builder;
      },
      where: (clause: unknown) => {
        state.where = clause;
        return builder;
      },
      orderBy: (...terms: unknown[]) => {
        state.orderBy = terms;
        return builder;
      },
      limit: (value: number) => {
        state.limit = value;
        return builder;
      },
      offset: (value: number) => {
        state.offset = value;
        return builder;
      },
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const filtered = mockState.events.filter((event) => matches(event, state.where));

        if (projection.value === "count") {
          return Promise.resolve([{ value: filtered.length }]).then(onFulfilled, onRejected);
        }

        const sorted = [...filtered].sort((a, b) => compare(a, b, state.orderBy));
        const sliced = sorted.slice(
          state.offset,
          state.limit === undefined ? undefined : state.offset + state.limit
        );

        const rows = sliced.map((event) => {
          const actor = state.joined
            ? mockState.users.find((user) => user.id === event.actorUserId) ?? null
            : null;
          const row: Record<string, unknown> = {};
          for (const [alias, column] of Object.entries(projection)) {
            const [table, field] = String(column).split(".");
            if (table === "users") {
              row[alias] = actor ? (actor as unknown as Record<string, unknown>)[field] ?? null : null;
            } else {
              row[alias] = (event as unknown as Record<string, unknown>)[field] ?? null;
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
    select: (projection: Record<string, string>) => selectBuilder(projection),
    update: () => ({
      set: (values: Partial<EventRow>) => ({
        where: (clause: unknown) => {
          for (const event of mockState.events) {
            if (matches(event, clause)) {
              Object.assign(event, values);
            }
          }
          return Promise.resolve();
        }
      })
    }),
    insert: () => ({
      values: (values: Omit<EventRow, "id" | "createdAt"> & { createdAt?: Date }) => {
        if (mockState.insertShouldFail) {
          return Promise.reject(new Error("DB_DOWN"));
        }
        mockState.nextId += 1;
        mockState.events.push({
          id: `event-${String(mockState.nextId).padStart(3, "0")}`,
          createdAt: values.createdAt ?? new Date(),
          ...values
        });
        return Promise.resolve();
      }
    })
  };

  return {
    db,
    and: (...args: unknown[]) => ["and", ...args],
    eq: (...args: unknown[]) => ["eq", ...args],
    desc: (value: unknown) => ["desc", value],
    asc: (value: unknown) => ["asc", value],
    count: () => "count",
    systemEvents: systemEventsToken,
    users: usersToken
  };
});

import { auditActionLabels, auditActions, isAuditAction } from "../features/audit/contracts";
import { listAuditEvents, recordAuditEvent, scrubActorEmails } from "../features/audit/service";

const MODERATOR = "user-moderator";
const ANONYMIZED = "user-anonymized";

const at = (minutes: number) => new Date(Date.UTC(2026, 6, 12, 10, minutes, 0));

const seedEvent = (row: Partial<EventRow> & { action: string }) => {
  mockState.nextId += 1;
  mockState.events.push({
    id: `seed-${String(mockState.nextId).padStart(3, "0")}`,
    actorUserId: null,
    actorEmail: null,
    entityType: null,
    entityId: null,
    summary: null,
    payload: null,
    createdAt: at(mockState.nextId),
    ...row
  });
};

beforeEach(() => {
  mockState.events = [];
  mockState.users = [
    { id: MODERATOR, displayName: "Пётр Модератор", anonymizedAt: null },
    { id: ANONYMIZED, displayName: "Удалённый пользователь", anonymizedAt: at(0) }
  ];
  mockState.insertShouldFail = false;
  mockState.nextId = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("recordAuditEvent", () => {
  it("пишет событие целиком", async () => {
    await recordAuditEvent({
      actorUserId: MODERATOR,
      actorEmail: "moder@example.com",
      action: "user.block",
      entityType: "user",
      entityId: "user-spammer",
      summary: "Спам в рецептах",
      payload: { reason: "спам" }
    });

    expect(mockState.events).toHaveLength(1);
    expect(mockState.events[0]).toMatchObject({
      actorUserId: MODERATOR,
      actorEmail: "moder@example.com",
      action: "user.block",
      entityType: "user",
      entityId: "user-spammer",
      summary: "Спам в рецептах",
      payload: { reason: "спам" }
    });
  });

  it("заполняет необязательные поля null (системное действие)", async () => {
    await recordAuditEvent({ action: "currency.update" });

    expect(mockState.events[0]).toMatchObject({
      actorUserId: null,
      actorEmail: null,
      action: "currency.update",
      entityType: null,
      entityId: null,
      summary: null,
      payload: null
    });
  });

  it("обрезает entityType/entityId под лимиты колонок", async () => {
    await recordAuditEvent({
      action: "ingredient.merge",
      entityType: "x".repeat(60),
      entityId: "y".repeat(90)
    });

    expect(mockState.events[0]?.entityType).toHaveLength(40);
    expect(mockState.events[0]?.entityId).toHaveLength(64);
  });

  it("не роняет вызывающего, если запись в БД упала", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mockState.insertShouldFail = true;

    await expect(recordAuditEvent({ action: "recipe.hide", entityId: "recipe-1" })).resolves.toBeUndefined();

    expect(mockState.events).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

describe("listAuditEvents", () => {
  beforeEach(() => {
    seedEvent({ action: "user.block", actorUserId: MODERATOR, entityType: "user", entityId: "user-1" });
    seedEvent({ action: "recipe.hide", actorUserId: MODERATOR, entityType: "recipe", entityId: "recipe-1" });
    seedEvent({ action: "recipe.hide", actorUserId: ANONYMIZED, actorEmail: "old@example.com", entityType: "recipe", entityId: "recipe-2" });
    seedEvent({ action: "currency.update" });
  });

  it("отдаёт свежие события первыми с метаданными страницы", async () => {
    const result = await listAuditEvents();

    expect(result.total).toBe(4);
    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(50);
    expect(result.items.map((item) => item.action)).toEqual([
      "currency.update",
      "recipe.hide",
      "recipe.hide",
      "user.block"
    ]);
  });

  it("подставляет русский лейбл действия", async () => {
    const result = await listAuditEvents({ action: "user.block" });

    expect(result.items[0]?.actionLabel).toBe("Блокировка пользователя");
  });

  it("фильтрует по действию", async () => {
    const result = await listAuditEvents({ action: "recipe.hide" });

    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items.every((item) => item.action === "recipe.hide")).toBe(true);
  });

  it("фильтрует по сущности", async () => {
    const result = await listAuditEvents({ entityType: "recipe", entityId: "recipe-2" });

    expect(result.total).toBe(1);
    expect(result.items[0]?.entityId).toBe("recipe-2");
  });

  it("фильтрует по актору", async () => {
    const result = await listAuditEvents({ actorUserId: MODERATOR });

    expect(result.total).toBe(2);
    expect(result.items.every((item) => item.actorUserId === MODERATOR)).toBe(true);
  });

  it("возвращает пустую страницу, когда под фильтр ничего не подошло", async () => {
    const result = await listAuditEvents({ action: "firmware.yank" });

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 50 });
  });

  it("листает постранично, сохраняя общее количество", async () => {
    const first = await listAuditEvents({ pageSize: 3, page: 1 });
    const second = await listAuditEvents({ pageSize: 3, page: 2 });

    expect(first.items).toHaveLength(3);
    expect(second.items).toHaveLength(1);
    expect(second.total).toBe(4);
    expect(second.page).toBe(2);
    const ids = [...first.items, ...second.items].map((item) => item.id);
    expect(new Set(ids).size).toBe(4);
  });

  it("нормализует негодные page/pageSize", async () => {
    const result = await listAuditEvents({ page: 0, pageSize: 5000 });

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(200);
  });

  it("берёт имя актора из профиля", async () => {
    const result = await listAuditEvents({ action: "user.block" });

    expect(result.items[0]).toMatchObject({ actorName: "Пётр Модератор", actorAnonymized: false });
  });

  it("у обезличенного актора не показывает и не отдаёт снимок e-mail", async () => {
    const result = await listAuditEvents({ entityId: "recipe-2" });

    expect(result.items[0]).toMatchObject({
      actorName: "Удалённый пользователь",
      actorEmail: null,
      actorUserId: ANONYMIZED,
      actorAnonymized: true
    });
  });

  it("называет действие без актора «Система»", async () => {
    const result = await listAuditEvents({ action: "currency.update" });

    expect(result.items[0]).toMatchObject({ actorName: "Система", actorUserId: null });
  });
});

describe("scrubActorEmails", () => {
  beforeEach(() => {
    seedEvent({ action: "user.block", actorUserId: MODERATOR, actorEmail: "moder@example.com", entityId: "user-1" });
    seedEvent({ action: "recipe.hide", actorUserId: MODERATOR, actorEmail: "moder@example.com", entityId: "recipe-1" });
    seedEvent({ action: "recipe.hide", actorUserId: ANONYMIZED, actorEmail: "old@example.com", entityId: "recipe-2" });
    seedEvent({ action: "currency.update", actorEmail: "cli@example.com" });
  });

  it("затирает все снимки e-mail этого актора, не трогая чужие", async () => {
    await scrubActorEmails(MODERATOR);

    const byActor = (actorUserId: string | null) =>
      mockState.events.filter((event) => event.actorUserId === actorUserId);

    expect(byActor(MODERATOR).every((event) => event.actorEmail === null)).toBe(true);
    expect(byActor(ANONYMIZED)[0]?.actorEmail).toBe("old@example.com");
    expect(byActor(null)[0]?.actorEmail).toBe("cli@example.com");
  });

  it("оставляет события актора в журнале со ссылкой на карточку", async () => {
    await scrubActorEmails(MODERATOR);

    const result = await listAuditEvents({ actorUserId: MODERATOR });

    expect(result.total).toBe(2);
    expect(result.items.every((item) => item.actorUserId === MODERATOR)).toBe(true);
    expect(result.items.every((item) => item.actorName === "Пётр Модератор")).toBe(true);
  });
});

describe("контракт действий", () => {
  it("у каждого действия есть русский лейбл", () => {
    for (const action of auditActions) {
      expect(auditActionLabels[action]).toBeTruthy();
    }
    expect(Object.keys(auditActionLabels)).toHaveLength(auditActions.length);
  });

  it("isAuditAction отсекает неизвестные коды", () => {
    expect(isAuditAction("user.block")).toBe(true);
    expect(isAuditAction("user.explode")).toBe(false);
    expect(isAuditAction(42)).toBe(false);
  });
});
