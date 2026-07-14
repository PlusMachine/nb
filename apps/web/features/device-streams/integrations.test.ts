import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
//  integrations.test.ts — колокированный тест RAPT-подключения БЕЗ реальной БД.
//
//  Паттерн зеркалит tests/admin-users-device-token.test.ts (innerJoin
//  users+владелец-устройства через Proxy-токены колонок) и ingest.test.ts
//  (живое in-memory состояние, не очередь заготовленных результатов) — здесь
//  оба приёма объединены, т.к. findRaptIntegrationByToken одновременно
//  join'ит users (бан/обезличивание) И читает/пишет живое состояние
//  (createOrGet/rotate/delete меняют store между шагами одного теста).
// =============================================================================

type Row = Record<string, unknown>;
type ColumnRef = { __column: true; table: string; name: string };
type Clause = { op: "eq"; column: ColumnRef; value: unknown } | { op: "and"; args: Clause[] };

const { store } = vi.hoisted(() => ({
  store: {
    integrations: [] as Row[],
    users: [] as Row[],
    devices: [] as Row[]
  }
}));

vi.mock("@nb/db", () => {
  const tableRows = (name: string): Row[] => {
    if (name === "userIntegrations") return store.integrations;
    if (name === "users") return store.users;
    if (name === "brewDevices") return store.devices;
    return [];
  };

  const tableToken = (name: string) =>
    new Proxy(
      { __table: name },
      {
        get: (_target, prop) => {
          const key = String(prop);
          return key === "__table" ? name : ({ __column: true, table: name, name: key } as ColumnRef);
        }
      }
    );

  const isColumn = (value: unknown): value is ColumnRef =>
    typeof value === "object" && value !== null && (value as ColumnRef).__column === true;

  const matches = (work: Record<string, Row>, clause: Clause | undefined): boolean => {
    if (!clause) return true;
    if (clause.op === "and") return clause.args.every((arg) => matches(work, arg));
    const row = work[clause.column.table];
    if (!row) return false;
    const right = isColumn(clause.value) ? work[clause.value.table]?.[clause.value.name] : clause.value;
    return row[clause.column.name] === right;
  };

  const COUNT_MARKER = { __count: true };

  const selectBuilder = (projection?: Record<string, unknown>) => {
    let baseTable = "";
    let work: Record<string, Row>[] = [];
    let where: Clause | undefined;

    const builder: Record<string, unknown> = {
      from: (table: { __table: string }) => {
        baseTable = table.__table;
        work = tableRows(baseTable).map((row) => ({ [baseTable]: row }));
        return builder;
      },
      innerJoin: (table: { __table: string }, on: Clause) => {
        const joinTable = table.__table;
        work = work.flatMap((item) =>
          tableRows(joinTable)
            .map((row) => ({ ...item, [joinTable]: row }))
            .filter((candidate) => matches(candidate, on))
        );
        return builder;
      },
      where: (clause: Clause) => {
        where = clause;
        return builder;
      },
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const matched = work.filter((item) => matches(item, where));

        if (!projection) {
          return Promise.resolve(matched.map((item) => ({ ...item[baseTable] }))).then(onFulfilled, onRejected);
        }

        const countKey = Object.keys(projection).find((key) => projection[key] === COUNT_MARKER);
        if (countKey) {
          return Promise.resolve([{ [countKey]: matched.length }]).then(onFulfilled, onRejected);
        }

        const rows = matched.map((item) => {
          const row: Row = {};
          for (const [alias, source] of Object.entries(projection)) {
            row[alias] = isColumn(source) ? (item[source.table]?.[source.name] ?? null) : null;
          }
          return row;
        });
        return Promise.resolve(rows).then(onFulfilled, onRejected);
      }
    };
    return builder;
  };

  const insertBuilder = (table: { __table: string }) => {
    const name = table.__table;
    let vals: Row = {};
    let conflictTargetCols: ColumnRef[] | null = null;

    const finishInsert = (skippedByConflict: boolean): Row[] => {
      if (skippedByConflict) return [];
      const row: Row = { id: `${name}-${tableRows(name).length + 1}`, createdAt: new Date(), updatedAt: new Date(), ...vals };
      tableRows(name).push(row);
      return [row];
    };

    const builder = {
      values: (v: Row) => {
        vals = v;
        return builder;
      },
      onConflictDoNothing: ({ target }: { target: ColumnRef[] }) => {
        conflictTargetCols = target;
        return builder;
      },
      returning: async () => {
        const conflict =
          conflictTargetCols !== null &&
          tableRows(name).some((row) => conflictTargetCols!.every((col) => row[col.name] === vals[col.name]));
        return finishInsert(conflict);
      }
    };
    return builder;
  };

  const updateBuilder = (table: { __table: string }) => {
    const name = table.__table;
    let setVals: Row = {};
    const builder = {
      set: (v: Row) => {
        setVals = v;
        return builder;
      },
      where: (clause: Clause) => ({
        returning: async () => {
          const updated: Row[] = [];
          for (const row of tableRows(name)) {
            if (matches({ [name]: row }, clause)) {
              Object.assign(row, setVals);
              updated.push({ ...row });
            }
          }
          return updated;
        }
      })
    };
    return builder;
  };

  const deleteBuilder = (table: { __table: string }) => {
    const name = table.__table;
    const builder = {
      where: (clause: Clause) => ({
        returning: async () => {
          const rows = tableRows(name);
          const removed = rows.filter((row) => matches({ [name]: row }, clause));
          const kept = rows.filter((row) => !matches({ [name]: row }, clause));
          rows.splice(0, rows.length, ...kept);
          return removed.map((row) => ({ ...row }));
        }
      })
    };
    return builder;
  };

  return {
    db: {
      select: (projection?: Record<string, unknown>) => selectBuilder(projection),
      insert: (table: { __table: string }) => insertBuilder(table),
      update: (table: { __table: string }) => updateBuilder(table),
      delete: (table: { __table: string }) => deleteBuilder(table)
    },
    userIntegrations: tableToken("userIntegrations"),
    users: tableToken("users"),
    brewDevices: tableToken("brewDevices"),
    and: (...args: Clause[]): Clause => ({ op: "and", args }),
    eq: (column: ColumnRef, value: unknown): Clause => ({ op: "eq", column, value }),
    count: () => COUNT_MARKER
  };
});

const mocks = vi.hoisted(() => ({
  assertRateLimit: vi.fn(async () => {}),
  tokenSeq: { n: 0 }
}));

vi.mock("@nb/auth", () => ({
  assertRateLimit: mocks.assertRateLimit,
  createRandomToken: () => `raw-token-${++mocks.tokenSeq.n}`,
  hashToken: (value: string) => `hash:${value}`
}));

vi.mock("@/lib/device-token-crypto", () => ({
  encryptDeviceToken: (raw: string) => `enc:${raw}`,
  decryptDeviceToken: (enc: string) => (typeof enc === "string" && enc.startsWith("enc:") ? enc.slice(4) : null)
}));

vi.mock("@/lib/env", () => ({
  getServerEnv: () => ({ APP_URL: "https://nb.test" })
}));

vi.mock("@/features/brew-controller/rapt-cloud-provider", () => ({ RAPT_PROVIDER_ID: "rapt-cloud" }));

import {
  createOrGetRaptIntegration,
  deleteRaptIntegration,
  findRaptIntegrationByToken,
  getRaptIntegration,
  rotateRaptWebhookToken
} from "./integrations";

const USER_ID = "user-1";

const seedUser = (overrides: Row = {}) => {
  store.users.push({ id: USER_ID, displayName: "Пивовар", blockedAt: null, anonymizedAt: null, ...overrides });
};

beforeEach(() => {
  store.integrations = [];
  store.users = [];
  store.devices = [];
  mocks.assertRateLimit.mockReset();
  mocks.assertRateLimit.mockResolvedValue(undefined);
  mocks.tokenSeq.n = 0;
  seedUser();
});

describe("createOrGetRaptIntegration", () => {
  it("создаёт подключение при первом вызове и отдаёт webhookUrl с raw-токеном", async () => {
    const integration = await createOrGetRaptIntegration(USER_ID);

    expect(integration.userId).toBe(USER_ID);
    expect(integration.webhookUrl).toBe("https://nb.test/api/ingest/rapt/raw-token-1");
    expect(integration.payloadTemplate).toContain("@device_id");
    expect(store.integrations).toHaveLength(1);
    expect(mocks.assertRateLimit).toHaveBeenCalledWith(USER_ID, "rapt_integration_create", 5, 3600);
  });

  it("идемпотентно: второй вызов возвращает ТУ ЖЕ строку, не создавая новую, и не считает rate limit", async () => {
    const first = await createOrGetRaptIntegration(USER_ID);
    mocks.assertRateLimit.mockClear();

    const second = await createOrGetRaptIntegration(USER_ID);

    expect(second.id).toBe(first.id);
    expect(store.integrations).toHaveLength(1);
    // Повторный (идемпотентный) фетч не должен считаться «созданием» — иначе
    // простое открытие экрана подключения душило бы лимит 5/час.
    expect(mocks.assertRateLimit).not.toHaveBeenCalled();
  });

  it("webhookUrl восстанавливается через decrypt при повторном чтении существующей строки", async () => {
    await createOrGetRaptIntegration(USER_ID);

    const again = await getRaptIntegration(USER_ID);

    expect(again?.webhookUrl).toBe("https://nb.test/api/ingest/rapt/raw-token-1");
  });
});

describe("getRaptIntegration", () => {
  it("null, если подключения ещё нет", async () => {
    await expect(getRaptIntegration(USER_ID)).resolves.toBeNull();
  });
});

describe("rotateRaptWebhookToken", () => {
  it("выпускает новый токен — старый больше не аутентифицирует", async () => {
    const created = await createOrGetRaptIntegration(USER_ID);
    const oldAuth = await findRaptIntegrationByToken("raw-token-1");
    expect(oldAuth?.id).toBe(created.id);

    const rotated = await rotateRaptWebhookToken(USER_ID);

    expect(rotated.id).toBe(created.id);
    expect(rotated.webhookUrl).toBe("https://nb.test/api/ingest/rapt/raw-token-2");
    await expect(findRaptIntegrationByToken("raw-token-1")).resolves.toBeNull();
    await expect(findRaptIntegrationByToken("raw-token-2")).resolves.toMatchObject({ id: created.id, userId: USER_ID });
  });

  it("нет подключения → NOT_FOUND", async () => {
    await expect(rotateRaptWebhookToken(USER_ID)).rejects.toThrow("NOT_FOUND");
  });
});

describe("deleteRaptIntegration", () => {
  it("удаляет строку подключения, но НЕ трогает RAPT-устройства пользователя — возвращает их счётчик", async () => {
    await createOrGetRaptIntegration(USER_ID);
    store.devices.push(
      { id: "dev-1", userId: USER_ID, providerId: "rapt-cloud" },
      { id: "dev-2", userId: USER_ID, providerId: "rapt-cloud" },
      { id: "dev-3", userId: USER_ID, providerId: "stream" } // стрим-устройство — не считается
    );

    const result = await deleteRaptIntegration(USER_ID);

    expect(result).toEqual({ deviceCount: 2 });
    expect(store.integrations).toHaveLength(0);
    expect(store.devices).toHaveLength(3); // устройства целы
  });

  it("нет подключения → NOT_FOUND", async () => {
    await expect(deleteRaptIntegration(USER_ID)).rejects.toThrow("NOT_FOUND");
  });
});

describe("findRaptIntegrationByToken — аутентификация", () => {
  it("левый (несуществующий) токен → null", async () => {
    await createOrGetRaptIntegration(USER_ID);

    await expect(findRaptIntegrationByToken("совсем-чужой-токен")).resolves.toBeNull();
  });

  it("пустой токен → null", async () => {
    await expect(findRaptIntegrationByToken("")).resolves.toBeNull();
  });

  it("подключение забаненного владельца не находится", async () => {
    store.users = [];
    seedUser({ blockedAt: new Date() });
    await createOrGetRaptIntegration(USER_ID);

    await expect(findRaptIntegrationByToken("raw-token-1")).resolves.toBeNull();
  });

  it("подключение обезличенного владельца не находится", async () => {
    store.users = [];
    seedUser({ anonymizedAt: new Date() });
    await createOrGetRaptIntegration(USER_ID);

    await expect(findRaptIntegrationByToken("raw-token-1")).resolves.toBeNull();
  });
});
