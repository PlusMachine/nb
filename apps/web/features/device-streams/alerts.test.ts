import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
//  alerts.test.ts — колокированный тест processIngestAlerts (§5 F6, M5-A) БЕЗ
//  реальной БД. Паттерн — sessions.test.ts/ingest.test.ts той же фичи: `@nb/db`
//  мокается in-memory-хранилищем (vi.hoisted), `@nb/push` мокается напрямую
//  (sendPushToUser — чужой пакет, best-effort по контракту; здесь только
//  проверяем, ЧТО и КОГДА зовём его, не саму доставку веб-пуша).
//
//  Многие фикстуры вердикта (likely_done/not_started) переиспользуют числа из
//  verdict-core.test.ts — но ЧЕРЕЗ smoothGravityMedian5 (alerts.ts сглаживает
//  сырые точки перед вердиктом, как и series.ts), поэтому сырые входы здесь —
//  это RAW-точки ДО сглаживания, а не уже сглаженные фикстуры того файла.
// =============================================================================

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

type Cond =
  | { kind: "eq"; col: string; value: unknown }
  | { kind: "and"; conds: Cond[] }
  | { kind: "gte"; col: string; value: Date };

type OrderMarker = { col: string; dir: "asc" };
type TableTag = { __rows: () => Record<string, unknown>[]; __name: string } & Record<string, string>;

const { store } = vi.hoisted(() => ({
  store: {
    sessions: [] as Record<string, unknown>[],
    readings: [] as Record<string, unknown>[],
    devices: [] as Record<string, unknown>[],
    batches: [] as Record<string, unknown>[],
    sessionUpdateCalls: 0
  }
}));

vi.mock("@nb/db", () => {
  const matches = (row: Record<string, unknown>, cond?: Cond): boolean => {
    if (!cond) return true;
    if (cond.kind === "and") return cond.conds.every((inner) => matches(row, inner));
    if (cond.kind === "gte") return (row[cond.col] as Date).getTime() >= cond.value.getTime();
    return row[cond.col] === cond.value;
  };

  const makeTable = (name: string, rows: () => Record<string, unknown>[], columns: string[]): TableTag => {
    const table = { __rows: rows, __name: name } as TableTag;
    for (const col of columns) table[col] = col;
    return table;
  };

  const sessionsTable = makeTable("fermentSessions", () => store.sessions, [
    "id", "userId", "brewBatchId", "deviceId", "startedAt", "alertsMuted", "alertState", "tempMinC", "tempMaxC"
  ]);
  const readingsTable = makeTable("fermentReadings", () => store.readings, [
    "id", "deviceId", "sessionId", "ts", "gravitySg", "tempC", "batteryV", "batteryPct", "excluded"
  ]);
  const devicesTable = makeTable("brewDevices", () => store.devices, ["id", "name"]);
  const batchesTable = makeTable("brewBatches", () => store.batches, ["id", "name", "recipeSnapshot"]);

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
          const { col } = order;
          result = [...result].sort((a, b) => (a[col] as Date).getTime() - (b[col] as Date).getTime());
        }
        if (!projection) {
          resolve(result.map((row) => ({ ...row })));
          return;
        }
        const keys = Object.keys(projection);
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
            if (table.__name === "fermentSessions") store.sessionUpdateCalls += 1;
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
    fermentSessions: sessionsTable,
    fermentReadings: readingsTable,
    brewDevices: devicesTable,
    brewBatches: batchesTable,
    eq: (col: string, value: unknown): Cond => ({ kind: "eq", col, value }),
    and: (...conds: Cond[]): Cond => ({ kind: "and", conds }),
    gte: (col: string, value: Date): Cond => ({ kind: "gte", col, value }),
    asc: (col: string): OrderMarker => ({ col, dir: "asc" })
  };
});

type PushPayloadLike = { title: string; body: string; tag: string; url: string };

const mocks = vi.hoisted(() => ({
  sendPushToUser: vi.fn<(userId: string, payload: PushPayloadLike) => Promise<number>>(async () => 1)
}));

vi.mock("@nb/push", () => ({ sendPushToUser: mocks.sendPushToUser }));

import { processIngestAlerts } from "./alerts";

const USER_ID = "user-1";
const DEVICE_ID = "device-1";
const BATCH_ID = "batch-1";
const SESSION_ID = "session-1";

const seedDevice = (overrides: Record<string, unknown> = {}) => {
  const device = { id: DEVICE_ID, name: "Ареометр кухня", ...overrides };
  store.devices.push(device);
  return device;
};

const seedBatch = (overrides: Record<string, unknown> = {}) => {
  const batch = { id: BATCH_ID, name: "IPA №7", recipeSnapshot: null as Record<string, unknown> | null, ...overrides };
  store.batches.push(batch);
  return batch;
};

const seedSession = (overrides: Record<string, unknown> = {}) => {
  const session = {
    id: SESSION_ID,
    userId: USER_ID,
    brewBatchId: BATCH_ID,
    deviceId: DEVICE_ID,
    startedAt: new Date(0),
    alertsMuted: false,
    alertState: {} as Record<string, string>,
    tempMinC: null as number | null,
    tempMaxC: null as number | null,
    ...overrides
  };
  store.sessions.push(session);
  return session;
};

const seedReading = (overrides: Record<string, unknown> = {}) => {
  const reading = {
    id: store.readings.length + 1,
    deviceId: DEVICE_ID,
    sessionId: SESSION_ID,
    ts: new Date(0),
    gravitySg: null as number | null,
    tempC: null as number | null,
    batteryV: null as number | null,
    batteryPct: null as number | null,
    excluded: false,
    ...overrides
  };
  store.readings.push(reading);
  return reading;
};

beforeEach(() => {
  store.sessions = [];
  store.readings = [];
  store.devices = [];
  store.batches = [];
  store.sessionUpdateCalls = 0;
  mocks.sendPushToUser.mockReset();
  mocks.sendPushToUser.mockResolvedValue(1);
});

describe("processIngestAlerts — базовые выходы", () => {
  it("sessionId=null → ничего не делает (нет активного сеанса)", async () => {
    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: null, receivedAt: new Date() });
    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it("alertsMuted=true → ничего не шлёт, alert_state не трогает", async () => {
    seedDevice();
    seedBatch();
    seedSession({ alertsMuted: true });
    seedReading({ batteryV: 3.0, ts: new Date(0) });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(0) });

    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
    expect(store.sessions[0]?.alertState).toEqual({});
  });
});

describe("processIngestAlerts — батарея", () => {
  it("вольты < 3.4 В → battery_low, впервые за сеанс (alert_state пуст)", async () => {
    seedDevice();
    seedBatch();
    seedSession();
    seedReading({ batteryV: 3.1, ts: new Date(0) });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(0) });

    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);
    const [userId, payload] = mocks.sendPushToUser.mock.calls[0]!;
    expect(userId).toBe(USER_ID);
    expect(payload.body).toContain("3.1 В");
    expect(payload.tag).toBe(`ferment-battery_low-${SESSION_ID}`);
  });

  it("проценты < 20% → battery_low", async () => {
    seedDevice();
    seedBatch();
    seedSession();
    seedReading({ batteryPct: 15, ts: new Date(0) });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(0) });

    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);
    const [, payload] = mocks.sendPushToUser.mock.calls[0]!;
    expect(payload.body).toContain("15%");
  });

  it("батарея в норме → не шлёт", async () => {
    seedDevice();
    seedBatch();
    seedSession();
    seedReading({ batteryV: 3.9, ts: new Date(0) });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(0) });

    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });
});

describe("processIngestAlerts — дедуп 12ч", () => {
  it("не шлёт повторно раньше 12ч, шлёт снова после", async () => {
    seedDevice();
    seedBatch();
    seedSession();
    seedReading({ batteryV: 3.0, ts: new Date(0) });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(0) });
    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);

    // +1ч — внутри окна дедупа (12ч) — повторной отправки нет.
    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(HOUR_MS) });
    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);

    // +13ч от первой отправки — вне окна — шлёт снова.
    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(13 * HOUR_MS) });
    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(2);
  });
});

describe("processIngestAlerts — вердикт брожения (§5 F5, через сглаживание)", () => {
  // Точки — RAW-фикстура verdict-core.test.ts «≥36ч, падение <0.003 → not_started»
  // (sessionStartTs=0, nowMs=40ч); симметричный узкий сглаживающий медианный
  // фильтр по 3 точкам их не меняет по существу (см. отчёт по расчётам).
  it("not_started: текст с советом проверить дрожжи", async () => {
    seedDevice();
    seedBatch();
    seedSession({ startedAt: new Date(0) });
    seedReading({ ts: new Date(0), gravitySg: 1.05 });
    seedReading({ ts: new Date(20 * HOUR_MS), gravitySg: 1.0495 });
    seedReading({ ts: new Date(40 * HOUR_MS), gravitySg: 1.049 });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(40 * HOUR_MS) });

    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);
    const [, payload] = mocks.sendPushToUser.mock.calls[0]!;
    expect(payload.title).toBe("Брожение не началось?: IPA №7");
    expect(payload.body).toContain("проверьте дрожжи");
  });

  // Точки — RAW-фикстура verdict-core.test.ts «targetFg неизвестен → likely_done»
  // (sessionStartTs=0, nowMs=120ч=5сут); после smoothGravityMedian5 хвост
  // (72ч/96ч/120ч) остаётся стабильным (размах 0.0002 ≤ 0.0015), стабильный
  // участок расширяется до 48ч (stableDays=3) — см. отчёт по расчётам.
  it("likely_done: заголовок «Похоже, добродило: …» + фраза П5 в теле", async () => {
    seedDevice();
    seedBatch({ recipeSnapshot: null });
    seedSession({ startedAt: new Date(0) });
    seedReading({ ts: new Date(0), gravitySg: 1.052 });
    seedReading({ ts: new Date(24 * HOUR_MS), gravitySg: 1.04 });
    seedReading({ ts: new Date(48 * HOUR_MS), gravitySg: 1.031 });
    seedReading({ ts: new Date(72 * HOUR_MS), gravitySg: 1.0302 });
    seedReading({ ts: new Date(96 * HOUR_MS), gravitySg: 1.03 });
    seedReading({ ts: new Date(120 * HOUR_MS), gravitySg: 1.0298 });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(120 * HOUR_MS) });

    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);
    const [, payload] = mocks.sendPushToUser.mock.calls[0]!;
    expect(payload.title).toBe("Похоже, добродило: IPA №7");
    expect(payload.body).toBe("Стабильно 3 дн. Перед розливом подтвердите плотность ареометром.");
    expect(payload.tag).toBe(`ferment-likely_done-${SESSION_ID}`);
  });
});

describe("processIngestAlerts — температурный коридор (§5 F6)", () => {
  it("первая точка «вне» ровно 29 мин назад → не слать (строго граничный случай)", async () => {
    seedDevice();
    seedBatch();
    seedSession({ tempMinC: 18, tempMaxC: 22 });
    const now = new Date(10 * DAY_MS);
    seedReading({ ts: new Date(now.getTime() - 29 * 60_000), tempC: 25 });
    seedReading({ ts: now, tempC: 25 });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: now });

    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });

  it("первая точка «вне» 31 минуту назад → temp_out", async () => {
    seedDevice();
    seedBatch();
    seedSession({ tempMinC: 18, tempMaxC: 22 });
    const now = new Date(10 * DAY_MS);
    seedReading({ ts: new Date(now.getTime() - 31 * 60_000), tempC: 25 });
    seedReading({ ts: now, tempC: 25 });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: now });

    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(1);
    const [, payload] = mocks.sendPushToUser.mock.calls[0]!;
    expect(payload.body).toBe("Температура 25°C вне коридора 18–22 °C.");
    expect(payload.tag).toBe(`ferment-temp_out-${SESSION_ID}`);
  });

  it("коридор не задан (tempMinC/tempMaxC null) → температура не проверяется", async () => {
    seedDevice();
    seedBatch();
    seedSession();
    const now = new Date(10 * DAY_MS);
    seedReading({ ts: new Date(now.getTime() - 60 * 60_000), tempC: 30 });
    seedReading({ ts: now, tempC: 30 });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: now });

    expect(mocks.sendPushToUser).not.toHaveBeenCalled();
  });
});

describe("processIngestAlerts — устойчивость к сбоям и запись alert_state", () => {
  it("падение sendPushToUser не валит процесс (best-effort)", async () => {
    seedDevice();
    seedBatch();
    seedSession();
    seedReading({ batteryV: 3.0, ts: new Date(0) });
    mocks.sendPushToUser.mockRejectedValueOnce(new Error("push failed"));

    await expect(
      processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: new Date(0) })
    ).resolves.toBeUndefined();
  });

  it("несколько кандидатов разом (батарея+температура) → один UPDATE alert_state на оба типа", async () => {
    seedDevice();
    seedBatch();
    seedSession({ tempMinC: 18, tempMaxC: 22 });
    const now = new Date(10 * DAY_MS);
    seedReading({ ts: new Date(now.getTime() - 60 * 60_000), tempC: 25, batteryV: 3.0 });
    seedReading({ ts: now, tempC: 25, batteryV: 3.0 });

    await processIngestAlerts({ deviceId: DEVICE_ID, sessionId: SESSION_ID, receivedAt: now });

    expect(mocks.sendPushToUser).toHaveBeenCalledTimes(2);
    expect(store.sessionUpdateCalls).toBe(1);
    const alertState = store.sessions[0]?.alertState as Record<string, string>;
    expect(Object.keys(alertState).sort()).toEqual(["battery_low", "temp_out"]);
  });
});
