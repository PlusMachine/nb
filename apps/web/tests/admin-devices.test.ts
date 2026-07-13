import { beforeEach, describe, expect, it, vi } from "vitest";

// Каждая цепочка db.select() записывает свои where/limit/offset в executed (в
// порядке вызова select()) и при await забирает следующий результат из очереди.
const { dbState } = vi.hoisted(() => ({
  dbState: {
    results: [] as unknown[][],
    executed: [] as { where?: unknown; limit?: number; offset?: number; table?: unknown }[]
  }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, { get: (_t, prop) => `${name}.${String(prop)}` });

  const makeQuery = () => {
    const record: { where?: unknown; limit?: number; offset?: number; table?: unknown } = {};
    dbState.executed.push(record);

    const chain: Record<string, unknown> = {
      from: (table: unknown) => {
        record.table = table;
        return chain;
      },
      where: (clause: unknown) => {
        record.where = clause;
        return chain;
      },
      limit: (value: number) => {
        record.limit = value;
        return chain;
      },
      offset: (value: number) => {
        record.offset = value;
        return chain;
      },
      then: (resolve: (value: unknown) => void) => resolve(dbState.results.shift() ?? [])
    };
    for (const method of ["leftJoin", "innerJoin", "orderBy", "groupBy"]) {
      chain[method] = () => chain;
    }
    return chain;
  };

  const sql = (strings: TemplateStringsArray, ...values: unknown[]) => ({
    sql: strings.raw.join("?"),
    values,
    mapWith: () => ({ sql: strings.raw.join("?"), values })
  });

  return {
    db: { select: () => makeQuery() },
    brewDevices: tableToken("brewDevices"),
    brewTelemetry: tableToken("brewTelemetry"),
    brewLogEvents: tableToken("brewLogEvents"),
    deviceLogFiles: tableToken("deviceLogFiles"),
    users: tableToken("users"),
    sql,
    count: () => ["count"],
    and: (...args: unknown[]) => ["and", ...args],
    or: (...args: unknown[]) => ["or", ...args],
    eq: (column: unknown, value: unknown) => ["eq", column, value],
    gt: (column: unknown, value: unknown) => ["gt", column, value],
    lte: (column: unknown, value: unknown) => ["lte", column, value],
    isNull: (column: unknown) => ["isNull", column],
    ilike: (column: unknown, value: unknown) => ["ilike", column, value],
    desc: (column: unknown) => ["desc", column]
  };
});

const revokeDeviceMock = vi.fn();
vi.mock("../features/devices/service", () => ({
  revokeDevice: (userId: string, deviceId: string) => revokeDeviceMock(userId, deviceId)
}));

import {
  DEVICE_EVENTS_PREVIEW_LIMIT,
  DEVICE_ONLINE_WITHIN_MS,
  DEVICE_TELEMETRY_PREVIEW_LIMIT,
  getAdminDevice,
  listAdminDevices,
  resolveDevicePresence,
  revokeDeviceAsAdmin
} from "../features/devices/admin";

const DEVICE_ID = "6f1c1a3e-9b2d-4c77-8a54-0d5b6e2f1a90";
const OTHER_DEVICE_ID = "0a9f8e7d-6c5b-4a39-8271-1e2d3c4b5a60";

const deviceRow = (overrides: Record<string, unknown> = {}) => ({
  id: DEVICE_ID,
  name: "Пивоварня",
  hardwareId: "bf-0001",
  fw: "2.1.0",
  status: "online",
  lastSeenAt: new Date(),
  createdAt: new Date("2026-06-01T00:00:00Z"),
  ownerId: "u-1",
  ownerName: "Артём",
  ownerEmail: "brewer@nb.dev",
  ownerBlockedAt: null,
  ...overrides
});

/** Плоский список узлов дерева условий: ["and", ["eq", col, v], ...] → все узлы. */
const flatten = (clause: unknown): unknown[][] => {
  if (!Array.isArray(clause)) {
    return [];
  }
  const [op, ...args] = clause as [string, ...unknown[]];
  const nested = args.flatMap((arg) => flatten(arg));
  return [[op, ...args], ...nested];
};

const hasOp = (clause: unknown, op: string, column?: string): boolean =>
  flatten(clause).some((node) => node[0] === op && (column === undefined || node[1] === column));

beforeEach(() => {
  dbState.results = [];
  dbState.executed = [];
  revokeDeviceMock.mockReset();
});

describe("присутствие устройства", () => {
  const now = Date.UTC(2026, 6, 12, 12, 0, 0);

  it("свежий контакт — в сети", () => {
    expect(resolveDevicePresence(new Date(now - 60_000), now)).toBe("online");
  });

  it("давний контакт — не в сети", () => {
    expect(resolveDevicePresence(new Date(now - DEVICE_ONLINE_WITHIN_MS - 1), now)).toBe("offline");
  });

  it("прибор без единого контакта — не в сети (а не «неизвестно»)", () => {
    expect(resolveDevicePresence(null, now)).toBe("offline");
  });
});

describe("список устройств", () => {
  const seedList = (rows: unknown[]) => {
    dbState.results = [
      [{ value: rows.length }],
      [{ online: 1, offline: 2 }],
      [
        { fw: "2.1.0", value: 2 },
        { fw: null, value: 1 }
      ],
      rows
    ];
  };

  it("отдаёт владельца, присутствие и версии прошивок", async () => {
    seedList([
      deviceRow(),
      deviceRow({ id: OTHER_DEVICE_ID, fw: null, lastSeenAt: null, ownerBlockedAt: new Date() })
    ]);

    const result = await listAdminDevices();

    expect(result.total).toBe(2);
    expect(result.onlineCount).toBe(1);
    expect(result.offlineCount).toBe(2);
    expect(result.items[0]?.presence).toBe("online");
    expect(result.items[0]?.ownerName).toBe("Артём");
    expect(result.items[1]?.presence).toBe("offline");
    expect(result.items[1]?.lastContactLabel).toBeNull();
    expect(result.items[1]?.ownerBlocked).toBe(true);
    // Фильтр по версии показывает, кто не обновился; приборы без fw — отдельным пунктом.
    expect(result.fwOptions).toEqual([
      { key: "2.1.0", label: "2.1.0", count: 2 },
      { key: "unknown", label: "Версия неизвестна", count: 1 }
    ]);
  });

  it("фильтр «в сети» режет по давности контакта", async () => {
    seedList([deviceRow()]);
    await listAdminDevices({ presence: "online" });

    const [totals] = dbState.executed;
    expect(hasOp(totals?.where, "gt", "brewDevices.lastSeenAt")).toBe(true);
  });

  it("фильтр «не в сети» ловит и приборы без единого контакта", async () => {
    seedList([deviceRow()]);
    await listAdminDevices({ presence: "offline" });

    const [totals] = dbState.executed;
    expect(hasOp(totals?.where, "isNull", "brewDevices.lastSeenAt")).toBe(true);
    expect(hasOp(totals?.where, "lte", "brewDevices.lastSeenAt")).toBe(true);
  });

  it("фильтр по версии прошивки; unknown — это NULL, а не строка", async () => {
    seedList([deviceRow()]);
    await listAdminDevices({ fw: "2.1.0" });
    expect(hasOp(dbState.executed[0]?.where, "eq", "brewDevices.fw")).toBe(true);

    dbState.executed = [];
    seedList([deviceRow()]);
    await listAdminDevices({ fw: "unknown" });
    expect(hasOp(dbState.executed[0]?.where, "isNull", "brewDevices.fw")).toBe(true);
    expect(hasOp(dbState.executed[0]?.where, "eq", "brewDevices.fw")).toBe(false);
  });

  it("поиск идёт по имени, заводскому номеру и владельцу, экранируя LIKE-шаблоны", async () => {
    seedList([deviceRow()]);
    await listAdminDevices({ query: "100%" });

    const where = dbState.executed[0]?.where;
    const columns = flatten(where)
      .filter((node) => node[0] === "ilike")
      .map((node) => node[1]);

    expect(columns).toEqual([
      "brewDevices.name",
      "brewDevices.hardwareId",
      "users.displayName",
      "users.email"
    ]);
    const patterns = flatten(where)
      .filter((node) => node[0] === "ilike")
      .map((node) => node[2]);
    expect(patterns.every((pattern) => pattern === "%100\\%%")).toBe(true);
  });

  it("страница ограничена лимитом и смещением", async () => {
    seedList([deviceRow()]);
    const result = await listAdminDevices({ page: 3 });

    const rowsQuery = dbState.executed[3];
    expect(rowsQuery?.limit).toBe(result.pageSize);
    expect(rowsQuery?.offset).toBe(result.pageSize * 2);
  });
});

describe("карточка устройства", () => {
  const seedDetail = () => {
    dbState.results = [
      [{ ...deviceRow(), updatedAt: new Date(), providerId: "brewforge", capabilities: ["heat"], localUrl: null, mqttPrefix: null, tokenHash: "hash" }],
      [{ id: 1, ts: new Date(), seq: 1, stage: 2, primaryC: 64.5, setpointC: 65, heatDutyPct: 40 }],
      [{ id: "e-1", ts: new Date(), type: "stage_changed", payload: {} }],
      [
        {
          id: "f-1",
          name: "brew-1.jsonl",
          sizeBytes: 2048,
          samplesImported: 100,
          eventsImported: 5,
          malformedLines: 0,
          importedAt: new Date()
        }
      ],
      [{ value: 125_000 }]
    ];
  };

  it("телеметрия и события читаются только пачкой с LIMIT (таблица телеметрии большая)", async () => {
    seedDetail();
    const detail = await getAdminDevice(DEVICE_ID);

    expect(detail?.telemetryTotal).toBe(125_000);
    expect(detail?.telemetry).toHaveLength(1);

    // Выборки строк телеметрии/событий обязаны идти с потолком: brew_telemetry —
    // самая большая таблица, запрос без LIMIT кладёт админку.
    const limits = dbState.executed.map((query) => query.limit);
    expect(limits).toContain(DEVICE_TELEMETRY_PREVIEW_LIMIT);
    expect(limits).toContain(DEVICE_EVENTS_PREVIEW_LIMIT);
  });

  it("нет устройства — нет карточки", async () => {
    dbState.results = [[]];
    expect(await getAdminDevice(DEVICE_ID)).toBeNull();
  });

  // brewDevices.id — колонка uuid: на мусор из адресной строки Postgres отвечает
  // ошибкой 22P02, а не пустой выборкой, и страница падает вместо 404.
  it("битый id из URL — 404, запрос в БД не уходит", async () => {
    expect(await getAdminDevice("нет-такого")).toBeNull();
    expect(dbState.executed).toHaveLength(0);
  });

  it("токен снят — прибор помечен отвязанным", async () => {
    seedDetail();
    dbState.results[0] = [
      {
        ...deviceRow(),
        updatedAt: new Date(),
        providerId: "brewforge",
        capabilities: [],
        localUrl: null,
        mqttPrefix: null,
        tokenHash: null
      }
    ];

    const detail = await getAdminDevice(DEVICE_ID);
    expect(detail?.device.revoked).toBe(true);
  });
});

describe("отвязка устройства админом", () => {
  it("переиспользует владельческий revokeDevice с владельцем прибора, а не с id админа", async () => {
    dbState.results = [[{ userId: "owner-7" }]];

    await revokeDeviceAsAdmin(DEVICE_ID);

    expect(revokeDeviceMock).toHaveBeenCalledWith("owner-7", DEVICE_ID);
  });

  it("нет устройства — NOT_FOUND, сервис не зовётся", async () => {
    dbState.results = [[]];

    await expect(revokeDeviceAsAdmin(DEVICE_ID)).rejects.toThrow("NOT_FOUND");
    expect(revokeDeviceMock).not.toHaveBeenCalled();
  });

  // Иначе uuid-колонка ловит 22P02, и словарь ошибок server action показывает
  // «Не удалось выполнить операцию» вместо «Устройство не найдено».
  it("битый id — NOT_FOUND, запрос в БД не уходит", async () => {
    await expect(revokeDeviceAsAdmin("нет-такого")).rejects.toThrow("NOT_FOUND");
    expect(dbState.executed).toHaveLength(0);
    expect(revokeDeviceMock).not.toHaveBeenCalled();
  });
});
