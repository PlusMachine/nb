import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
//  sessions.test.ts — колокированный тест sessions.ts (F2) БЕЗ реальной БД.
//
//  Паттерн — ingest.test.ts той же фичи: `@nb/db` мокается in-memory-хранилищем
//  (vi.hoisted), а не поднимает реальный Postgres. `getBrewBatchById` (features/
//  brew-batches/service.ts, чужой файл — не трогаем, только читаем) мокается
//  напрямую — sessions.ts его только вызывает, ownership/статус партии здесь не
//  дублируются, они уже проверяются самим getBrewBatchById в реальном коде.
// =============================================================================

type Cond =
  | { kind: "eq"; col: string; value: unknown }
  | { kind: "and"; conds: Cond[] }
  | { kind: "isNull"; col: string }
  | { kind: "gte"; col: string; value: Date }
  | { kind: "inArray"; col: string; values: unknown[] };

type OrderMarker = { col: string; dir: "asc" | "desc" };

type TableTag = { __rows: () => Record<string, unknown>[]; __name: string } & Record<string, string>;

const COUNT_MARKER = "__count__";

const { store } = vi.hoisted(() => ({
  store: {
    devices: [] as Record<string, unknown>[],
    sessions: [] as Record<string, unknown>[],
    readings: [] as Record<string, unknown>[]
  }
}));

vi.mock("@nb/db", () => {
  const matches = (row: Record<string, unknown>, cond?: Cond): boolean => {
    if (!cond) return true;
    if (cond.kind === "and") return cond.conds.every((inner) => matches(row, inner));
    if (cond.kind === "isNull") return row[cond.col] === null || row[cond.col] === undefined;
    if (cond.kind === "gte") return (row[cond.col] as Date).getTime() >= cond.value.getTime();
    if (cond.kind === "inArray") return cond.values.includes(row[cond.col]);
    return row[cond.col] === cond.value;
  };

  const makeTable = (name: string, rows: () => Record<string, unknown>[], columns: string[]): TableTag => {
    const table = { __rows: rows, __name: name } as TableTag;
    for (const col of columns) table[col] = col;
    return table;
  };

  const devicesTable = makeTable("brewDevices", () => store.devices, [
    "id",
    "userId",
    "providerId",
    "name",
    "hardwareId",
    "hardwareKind",
    "status",
    "lastSeenAt",
    "createdAt",
    "updatedAt"
  ]);
  const sessionsTable = makeTable("fermentSessions", () => store.sessions, [
    "id",
    "userId",
    "deviceId",
    "brewBatchId",
    "startedAt",
    "endedAt",
    "endReason",
    "calibrationOffsetSg",
    "tempMinC",
    "tempMaxC",
    "alertsMuted",
    "createdAt",
    "updatedAt"
  ]);
  const readingsTable = makeTable("fermentReadings", () => store.readings, [
    "id",
    "deviceId",
    "sessionId",
    "ts",
    "gravitySg",
    "tempC",
    "pressureKpa",
    "batteryV",
    "batteryPct",
    "rssi",
    "excluded",
    "payload",
    "createdAt"
  ]);

  // Мини-реализация select().from().where().orderBy(asc(col)) — сортировка нужна
  // только для findRetroCandidateTimestamps (по возрастанию ts); фильтрует ЖИВОЕ
  // состояние store, как в ingest.test.ts (не очередь заготовленных результатов).
  const makeSelectChain = (rows: () => Record<string, unknown>[], projection?: Record<string, string>) => {
    let filtered: Record<string, unknown>[] | null = null;
    let order: OrderMarker | null = null;
    const chain = {
      where: (cond: Cond) => {
        filtered = rows().filter((row) => matches(row, cond));
        return chain;
      },
      orderBy: (marker: OrderMarker) => {
        order = marker;
        return chain;
      },
      then: (resolve: (value: unknown) => void) => {
        let result = filtered ?? [...rows()];
        if (order) {
          const { col, dir } = order;
          result = [...result].sort((a, b) => {
            const diff = (a[col] as Date).getTime() - (b[col] as Date).getTime();
            return dir === "desc" ? -diff : diff;
          });
        }
        if (!projection) {
          resolve(result.map((row) => ({ ...row })));
          return;
        }
        const keys = Object.keys(projection);
        if (keys.length === 1 && projection[keys[0]!] === COUNT_MARKER) {
          resolve([{ [keys[0]!]: result.length }]);
          return;
        }
        resolve(
          result.map((row) => {
            const out: Record<string, unknown> = {};
            for (const key of keys) out[key] = row[projection[key]!];
            return out;
          })
        );
      }
    };
    return chain;
  };

  const db = {
    select: (projection?: Record<string, string>) => ({
      from: (table: TableTag) => makeSelectChain(table.__rows, projection)
    }),
    insert: (table: TableTag) => ({
      values: (values: Record<string, unknown>) => ({
        returning: async () => {
          // Партиальный уникальный индекс ferment_sessions_active_device_uidx (§6.2):
          // симулируем конфликт вставки второго активного сеанса того же устройства —
          // проверяет "страховку" sessions.ts поверх предварительного SELECT-чека.
          if (table.__name === "fermentSessions") {
            const isActive = values.endedAt === null || values.endedAt === undefined;
            if (isActive) {
              const conflict = table
                .__rows()
                .some((row) => row.deviceId === values.deviceId && (row.endedAt === null || row.endedAt === undefined));
              if (conflict) {
                const err = new Error('duplicate key value violates unique constraint "ferment_sessions_active_device_uidx"');
                (err as { code?: string }).code = "23505";
                throw err;
              }
            }
          }
          const row: Record<string, unknown> = {
            id: `${table.__name}-${table.__rows().length + 1}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            endedAt: null,
            endReason: null,
            calibrationOffsetSg: 0,
            tempMinC: null,
            tempMaxC: null,
            alertsMuted: false,
            sessionId: null,
            excluded: false,
            ...values
          };
          table.__rows().push(row);
          return [row];
        }
      })
    }),
    update: (table: TableTag) => ({
      set: (setValues: Record<string, unknown>) => ({
        where: (cond: Cond) => {
          const run = () => {
            const affected: Record<string, unknown>[] = [];
            for (const row of table.__rows()) {
              if (matches(row, cond)) {
                Object.assign(row, setValues);
                affected.push(row);
              }
            }
            return affected;
          };
          return {
            returning: async () => run(),
            then: (resolve: (value: unknown) => void) => resolve(run())
          };
        }
      })
    })
  };

  return {
    db,
    brewDevices: devicesTable,
    fermentSessions: sessionsTable,
    fermentReadings: readingsTable,
    eq: (col: string, value: unknown): Cond => ({ kind: "eq", col, value }),
    and: (...conds: Cond[]): Cond => ({ kind: "and", conds }),
    isNull: (col: string): Cond => ({ kind: "isNull", col }),
    gte: (col: string, value: Date): Cond => ({ kind: "gte", col, value }),
    inArray: (col: string, values: unknown[]): Cond => ({ kind: "inArray", col, values }),
    asc: (col: string): OrderMarker => ({ col, dir: "asc" }),
    count: () => COUNT_MARKER
  };
});

const mocks = vi.hoisted(() => ({
  assertRateLimit: vi.fn(async () => {}),
  getBrewBatchById: vi.fn()
}));

vi.mock("@nb/auth", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("@/features/brew-batches/service", () => ({ getBrewBatchById: mocks.getBrewBatchById }));

import {
  createFermentSession,
  endActiveSessionsForBatch,
  endFermentSession,
  getActiveSessionForDevice,
  listAvailableStreamDevices,
  listSessionsForBatch,
  listSessionsForDevice,
  previewRetroAttach
} from "./sessions";

const USER = "user-1";
const OTHER_USER = "user-2";
const FIXED_NOW = new Date("2026-07-14T12:00:00Z");
const DAY_MS = 24 * 60 * 60 * 1000;

const streamDevice = (overrides: Record<string, unknown> = {}) => ({
  id: "device-1",
  userId: USER,
  providerId: "stream",
  name: "Ареометр кухня",
  hardwareId: "st-abc123",
  hardwareKind: "ispindel",
  status: "online",
  lastSeenAt: null,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
  ...overrides
});

const seedDevice = (overrides: Record<string, unknown> = {}) => {
  const device = streamDevice(overrides);
  store.devices.push(device);
  return device;
};

const brewBatch = (overrides: Record<string, unknown> = {}) => ({
  id: "batch-1",
  userId: USER,
  status: "fermenting",
  ...overrides
});

const seedReading = (overrides: Record<string, unknown> = {}) => {
  const reading: Record<string, unknown> = {
    id: store.readings.length + 1,
    deviceId: "device-1",
    sessionId: null,
    ts: FIXED_NOW,
    gravitySg: 1.05,
    tempC: 19,
    pressureKpa: null,
    batteryV: 4,
    batteryPct: null,
    rssi: -70,
    excluded: false,
    payload: {},
    createdAt: new Date(),
    ...overrides
  };
  store.readings.push(reading);
  return reading;
};

const seedSessionRow = (overrides: Record<string, unknown> = {}) => {
  const row: Record<string, unknown> = {
    id: `session-seed-${store.sessions.length + 1}`,
    userId: USER,
    deviceId: "device-1",
    brewBatchId: "batch-1",
    startedAt: new Date(FIXED_NOW.getTime() - 10 * DAY_MS),
    endedAt: new Date(FIXED_NOW.getTime() - DAY_MS),
    endReason: "manual",
    calibrationOffsetSg: 0,
    tempMinC: null,
    tempMaxC: null,
    alertsMuted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
  store.sessions.push(row);
  return row;
};

beforeEach(() => {
  store.devices = [];
  store.sessions = [];
  store.readings = [];
  mocks.assertRateLimit.mockReset();
  mocks.assertRateLimit.mockResolvedValue(undefined);
  mocks.getBrewBatchById.mockReset();
  mocks.getBrewBatchById.mockResolvedValue(brewBatch());
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("createFermentSession — happy path", () => {
  it("создаёт сеанс для владельца устройства и партии в статусе fermenting", async () => {
    seedDevice();

    const session = await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });

    expect(session.deviceId).toBe("device-1");
    expect(session.brewBatchId).toBe("batch-1");
    expect(session.deviceName).toBe("Ареометр кухня");
    expect(session.deviceHardwareKind).toBe("ispindel");
    expect(session.endedAt).toBeNull();
    expect(session.calibrationOffsetSg).toBe(0);
    expect(session.readingsCount).toBe(0);
    expect(session.startedAt.getTime()).toBe(FIXED_NOW.getTime());
    expect(store.sessions).toHaveLength(1);
  });

  it("партия в статусе brewing тоже допустима (поплавок кидают в сусло в день варки)", async () => {
    seedDevice();
    mocks.getBrewBatchById.mockResolvedValue(brewBatch({ status: "brewing" }));

    const session = await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });

    expect(session.id).toBeDefined();
  });

  it("явный startedAt без ретро-привязки используется как есть", async () => {
    seedDevice();
    const customStart = new Date(FIXED_NOW.getTime() - 3 * 60 * 60 * 1000);

    const session = await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1", startedAt: customStart });

    expect(session.startedAt.getTime()).toBe(customStart.getTime());
  });
});

describe("createFermentSession — владение", () => {
  it("чужое устройство → NOT_FOUND", async () => {
    seedDevice({ userId: OTHER_USER });

    await expect(createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" })).rejects.toThrow("NOT_FOUND");
  });

  it("не-stream устройство (BrewForge) → NOT_FOUND", async () => {
    seedDevice({ providerId: "brewforge" });

    await expect(createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" })).rejects.toThrow("NOT_FOUND");
  });

  it("чужая/несуществующая партия → NOT_FOUND", async () => {
    seedDevice();
    mocks.getBrewBatchById.mockResolvedValue(null);

    await expect(createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" })).rejects.toThrow("NOT_FOUND");
  });
});

// M4-B: providerId='rapt-cloud' (автообнаруженный RAPT Pill/камера/BrewZilla)
// должен привязываться к партии ровно как generic-стрим-устройство — раньше
// getOwnedStreamDeviceRow фильтровала строго providerId==='stream', и RAPT-
// устройство падало в NOT_FOUND (см. STREAM_LIKE_PROVIDER_IDS, contracts.ts).
describe("createFermentSession — rapt-устройство привязывается (M4-B)", () => {
  it("providerId='rapt-cloud' создаёт сеанс наравне со стрим-устройством", async () => {
    seedDevice({ providerId: "rapt-cloud", hardwareId: "rapt-abc123", hardwareKind: "rapt-pill", name: "RAPT Pill" });

    const session = await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });

    expect(session.deviceId).toBe("device-1");
    expect(session.deviceName).toBe("RAPT Pill");
    expect(session.deviceHardwareKind).toBe("rapt-pill");
    expect(session.endedAt).toBeNull();
  });

  it("чужое rapt-устройство → NOT_FOUND (владение не ослаблено вместе с расширением providerId)", async () => {
    seedDevice({ providerId: "rapt-cloud", userId: OTHER_USER, hardwareId: "rapt-other" });

    await expect(createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" })).rejects.toThrow("NOT_FOUND");
  });
});

describe("createFermentSession — статус партии", () => {
  it.each(["planned", "completed", "cancelled"] as const)(
    "статус партии %s → SESSION_INVALID_BATCH_STATUS",
    async (status) => {
      seedDevice();
      mocks.getBrewBatchById.mockResolvedValue(brewBatch({ status }));

      await expect(createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" })).rejects.toThrow(
        "SESSION_INVALID_BATCH_STATUS"
      );
    }
  );
});

describe("createFermentSession — единственность активного сеанса устройства", () => {
  it("второй активный сеанс того же устройства → SESSION_DEVICE_BUSY", async () => {
    seedDevice();
    await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });

    await expect(createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" })).rejects.toThrow(
      "SESSION_DEVICE_BUSY"
    );
    expect(store.sessions).toHaveLength(1);
  });

  it("гонка двух параллельных запросов даёт ровно один активный сеанс (страховка на конфликте вставки)", async () => {
    seedDevice();

    const results = await Promise.allSettled([
      createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" }),
      createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" })
    ]);

    // Порядок микрозадач не специфицирован — важен инвариант (ровно один успех),
    // а не то, какой именно защитный слой (пред-чек или конфликт вставки) сработал.
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason.message).toBe("SESSION_DEVICE_BUSY");
    expect(store.sessions.filter((row) => row.endedAt === null || row.endedAt === undefined)).toHaveLength(1);
  });
});

describe("createFermentSession — ретро-привязка (§5 F2)", () => {
  it("доприсваивает непривязанные точки за 7 дней; startedAt = min(ts); точки старше не трогает", async () => {
    seedDevice();
    const within6d = new Date(FIXED_NOW.getTime() - 6 * DAY_MS);
    const within2d = new Date(FIXED_NOW.getTime() - 2 * DAY_MS);
    const outside8d = new Date(FIXED_NOW.getTime() - 8 * DAY_MS);

    const readingOld = seedReading({ ts: within6d });
    const readingNew = seedReading({ ts: within2d });
    const readingTooOld = seedReading({ ts: outside8d });

    const session = await createFermentSession(USER, {
      deviceId: "device-1",
      brewBatchId: "batch-1",
      retroAttach: true
    });

    expect(session.startedAt.getTime()).toBe(within6d.getTime());
    expect(readingOld.sessionId).toBe(session.id);
    expect(readingNew.sessionId).toBe(session.id);
    expect(readingTooOld.sessionId).toBeNull();
    expect(session.readingsCount).toBe(2);
  });

  it("нет непривязанных точек — retroAttach ничего не меняет, startedAt = сейчас", async () => {
    seedDevice();

    const session = await createFermentSession(USER, {
      deviceId: "device-1",
      brewBatchId: "batch-1",
      retroAttach: true
    });

    expect(session.startedAt.getTime()).toBe(FIXED_NOW.getTime());
    expect(session.readingsCount).toBe(0);
  });

  it("без retroAttach непривязанные показания не трогаются", async () => {
    seedDevice();
    const reading = seedReading({ ts: new Date(FIXED_NOW.getTime() - 60 * 60 * 1000) });

    const session = await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });

    expect(reading.sessionId).toBeNull();
    expect(session.startedAt.getTime()).toBe(FIXED_NOW.getTime());
  });
});

describe("previewRetroAttach", () => {
  it("считает count/oldestTs/newestTs только по непривязанным точкам за последние 7 дней", async () => {
    seedDevice();
    const oldest = new Date(FIXED_NOW.getTime() - 6 * DAY_MS);
    const newest = new Date(FIXED_NOW.getTime() - 1 * DAY_MS);
    seedReading({ ts: oldest });
    seedReading({ ts: newest });
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 9 * DAY_MS) }); // вне окна
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 3 * DAY_MS), sessionId: "session-other" }); // уже привязана

    const preview = await previewRetroAttach(USER, "device-1");

    expect(preview).toEqual({ count: 2, oldestTs: oldest, newestTs: newest });
  });

  it("чужое устройство → NOT_FOUND", async () => {
    seedDevice({ userId: OTHER_USER });

    await expect(previewRetroAttach(USER, "device-1")).rejects.toThrow("NOT_FOUND");
  });
});

describe("endFermentSession", () => {
  it("завершает активный сеанс с указанным поводом", async () => {
    seedDevice();
    const session = await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });

    const ended = await endFermentSession(USER, session.id, "manual");

    expect(ended.endedAt).not.toBeNull();
    expect(ended.endReason).toBe("manual");
  });

  it("повторный вызов идемпотентен — повод и время завершения не перезаписываются", async () => {
    seedDevice();
    const session = await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });
    const firstEnd = await endFermentSession(USER, session.id, "manual");

    vi.setSystemTime(new Date(FIXED_NOW.getTime() + 60_000));
    const secondEnd = await endFermentSession(USER, session.id, "batch_completed");

    expect(secondEnd.endedAt?.getTime()).toBe(firstEnd.endedAt?.getTime());
    expect(secondEnd.endReason).toBe("manual");
  });

  it("чужой/несуществующий сеанс → NOT_FOUND", async () => {
    await expect(endFermentSession(USER, "missing-session", "manual")).rejects.toThrow("NOT_FOUND");
  });
});

describe("endActiveSessionsForBatch", () => {
  it("завершает все активные сеансы партии разом, не трогая уже завершённые", async () => {
    seedDevice({ id: "device-1" });
    seedDevice({ id: "device-2", hardwareId: "st-def456" });

    const sessionA = await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });
    const sessionB = await createFermentSession(USER, { deviceId: "device-2", brewBatchId: "batch-1" });
    const alreadyEnded = seedSessionRow({ deviceId: "device-3", id: "session-ended-1" });

    const ended = await endActiveSessionsForBatch(USER, "batch-1", "batch_completed");

    expect(ended.map((s) => s.id).sort()).toEqual([sessionA.id, sessionB.id].sort());
    expect(ended.every((s) => s.endReason === "batch_completed" && s.endedAt !== null)).toBe(true);

    const untouched = store.sessions.find((row) => row.id === alreadyEnded.id)!;
    expect(untouched.endReason).toBe("manual");
    expect((untouched.endedAt as Date).getTime()).toBe((alreadyEnded.endedAt as Date).getTime());
  });

  it("чужая/несуществующая партия → NOT_FOUND", async () => {
    mocks.getBrewBatchById.mockResolvedValue(null);

    await expect(endActiveSessionsForBatch(USER, "batch-1", "manual")).rejects.toThrow("NOT_FOUND");
  });
});

describe("listSessionsForDevice / listSessionsForBatch / getActiveSessionForDevice", () => {
  it("отдают DTO с именем/видом устройства и счётчиком точек", async () => {
    seedDevice({ id: "device-1" });
    const session = await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });
    seedReading({ deviceId: "device-1", sessionId: session.id, ts: FIXED_NOW });

    const byDevice = await listSessionsForDevice(USER, "device-1");
    const byBatch = await listSessionsForBatch(USER, "batch-1");
    const active = await getActiveSessionForDevice(USER, "device-1");

    expect(byDevice).toHaveLength(1);
    expect(byDevice[0]?.readingsCount).toBe(1);
    expect(byDevice[0]?.deviceName).toBe("Ареометр кухня");
    expect(byBatch).toHaveLength(1);
    expect(active?.id).toBe(session.id);
  });

  it("getActiveSessionForDevice — null, если активного сеанса нет", async () => {
    seedDevice({ id: "device-1" });

    expect(await getActiveSessionForDevice(USER, "device-1")).toBeNull();
  });
});

describe("listAvailableStreamDevices", () => {
  it("не отдаёт занятые и чужие устройства; помечает hasRetroReadings по непривязанным точкам за 7 дней", async () => {
    seedDevice({ id: "device-1", name: "Занят" });
    seedDevice({ id: "device-2", name: "Свободен с ретро", hardwareId: "st-def456" });
    seedDevice({ id: "device-3", name: "Свободен без ретро", hardwareId: "st-ghi789" });
    seedDevice({ id: "device-4", name: "Чужой", userId: OTHER_USER, hardwareId: "st-other" });

    await createFermentSession(USER, { deviceId: "device-1", brewBatchId: "batch-1" });
    seedReading({ deviceId: "device-2", ts: new Date(FIXED_NOW.getTime() - 1 * DAY_MS) });
    seedReading({ deviceId: "device-3", ts: new Date(FIXED_NOW.getTime() - 10 * DAY_MS) });

    const available = await listAvailableStreamDevices(USER);
    const byId = new Map(available.map((device) => [device.id, device]));

    expect(byId.has("device-1")).toBe(false);
    expect(byId.has("device-4")).toBe(false);
    expect(byId.get("device-2")?.hasRetroReadings).toBe(true);
    expect(byId.get("device-3")?.hasRetroReadings).toBe(false);
  });

  // M4-B: RAPT-устройство свободно (без активного сеанса) должно предлагаться
  // «Ареометр уже в сусле?»/«Подключить ареометр» наравне со стрим-устройством.
  it("отдаёт свободное rapt-cloud устройство наравне со стрим-устройством", async () => {
    seedDevice({ id: "device-1", providerId: "rapt-cloud", hardwareId: "rapt-abc123", hardwareKind: "rapt-pill", name: "RAPT Pill" });

    const available = await listAvailableStreamDevices(USER);

    expect(available).toHaveLength(1);
    expect(available[0]?.id).toBe("device-1");
    expect(available[0]?.hardwareKind).toBe("rapt-pill");
  });
});
