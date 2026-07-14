import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
//  corrections.test.ts — колокированный тест corrections.ts (F4) БЕЗ реальной БД.
//
//  Паттерн — sessions.test.ts/ingest.test.ts той же фичи: `@nb/db` мокается
//  in-memory-хранилищем (vi.hoisted), фильтрует ЖИВОЕ состояние store. Плюс:
//  `drizzle-orm` мокается отдельно ради единственного оператора `lt` (его нет в
//  барреле @nb/db — см. комментарий в corrections.ts) — только он, `@nb/db`
//  предоставляет всё остальное (and/or/eq/gt/gte/lte/count/asc) сам.
//  `addBrewMeasurement` (features/brew-batches/service.ts, чужой файл — не
//  трогаем, только читаем) мокается напрямую — corrections.ts его только
//  вызывает по явному подтверждению (F4.4, П2), сам в brew_measurements не пишет.
// =============================================================================

type Cond =
  | { kind: "eq"; col: string; value: unknown }
  | { kind: "and"; conds: Cond[] }
  | { kind: "or"; conds: Cond[] }
  | { kind: "gte"; col: string; value: Date }
  | { kind: "lte"; col: string; value: Date }
  | { kind: "gt"; col: string; value: Date }
  | { kind: "lt"; col: string; value: Date };

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

const matches = (row: Record<string, unknown>, cond?: Cond): boolean => {
  if (!cond) return true;
  if (cond.kind === "and") return cond.conds.every((inner) => matches(row, inner));
  if (cond.kind === "or") return cond.conds.some((inner) => matches(row, inner));
  if (cond.kind === "gte") return (row[cond.col] as Date).getTime() >= cond.value.getTime();
  if (cond.kind === "lte") return (row[cond.col] as Date).getTime() <= cond.value.getTime();
  if (cond.kind === "gt") return (row[cond.col] as Date).getTime() > cond.value.getTime();
  if (cond.kind === "lt") return (row[cond.col] as Date).getTime() < cond.value.getTime();
  return row[cond.col] === cond.value;
};

vi.mock("drizzle-orm", () => ({
  lt: (col: string, value: Date): Cond => ({ kind: "lt", col, value })
}));

vi.mock("@nb/db", () => {
  const makeTable = (name: string, rows: () => Record<string, unknown>[], columns: string[]): TableTag => {
    const table = { __rows: rows, __name: name } as TableTag;
    for (const col of columns) table[col] = col;
    return table;
  };

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

  const makeUpdateChain = (table: TableTag) => ({
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
          returning: async (projection?: Record<string, string>) => {
            const rows = run();
            if (!projection) return rows.map((row) => ({ ...row }));
            return rows.map((row) => {
              const out: Record<string, unknown> = {};
              for (const key of Object.keys(projection)) out[key] = row[projection[key]!];
              return out;
            });
          },
          then: (resolve: (value: unknown) => void) => resolve(run())
        };
      }
    })
  });

  const makeDeleteChain = (table: TableTag) => ({
    where: (cond: Cond) => {
      const run = () => {
        const rows = table.__rows();
        const removed: Record<string, unknown>[] = [];
        for (let i = rows.length - 1; i >= 0; i--) {
          if (matches(rows[i]!, cond)) {
            removed.push(rows[i]!);
            rows.splice(i, 1);
          }
        }
        return removed.reverse();
      };
      return {
        returning: async (projection?: Record<string, string>) => {
          const rows = run();
          if (!projection) return rows.map((row) => ({ ...row }));
          return rows.map((row) => {
            const out: Record<string, unknown> = {};
            for (const key of Object.keys(projection)) out[key] = row[projection[key]!];
            return out;
          });
        },
        then: (resolve: (value: unknown) => void) => resolve(run())
      };
    }
  });

  const db = {
    select: (projection?: Record<string, string>) => ({
      from: (table: TableTag) => makeSelectChain(table.__rows, projection)
    }),
    update: (table: TableTag) => makeUpdateChain(table),
    delete: (table: TableTag) => makeDeleteChain(table)
  };

  return {
    db,
    brewDevices: devicesTable,
    fermentSessions: sessionsTable,
    fermentReadings: readingsTable,
    eq: (col: string, value: unknown): Cond => ({ kind: "eq", col, value }),
    and: (...conds: (Cond | undefined)[]): Cond => ({ kind: "and", conds: conds.filter((c): c is Cond => !!c) }),
    or: (...conds: (Cond | undefined)[]): Cond => ({ kind: "or", conds: conds.filter((c): c is Cond => !!c) }),
    gte: (col: string, value: Date): Cond => ({ kind: "gte", col, value }),
    lte: (col: string, value: Date): Cond => ({ kind: "lte", col, value }),
    gt: (col: string, value: Date): Cond => ({ kind: "gt", col, value }),
    asc: (col: string): OrderMarker => ({ col, dir: "asc" }),
    count: () => COUNT_MARKER
  };
});

const mocks = vi.hoisted(() => ({
  addBrewMeasurement: vi.fn()
}));

vi.mock("@/features/brew-batches/service", () => ({ addBrewMeasurement: mocks.addBrewMeasurement }));

import {
  applySessionCalibration,
  clearSessionCalibration,
  confirmGravityFromCurve,
  countSessionReadingsInRange,
  deleteSessionData,
  deleteSessionReadings,
  previewGravityFromCurve,
  setReadingsExcluded,
  updateSessionBounds
} from "./corrections";

const USER = "user-1";
const OTHER_USER = "user-2";
const FIXED_NOW = new Date("2026-07-14T12:00:00Z");
const HOUR_MS = 60 * 60 * 1000;

const seedDevice = (overrides: Record<string, unknown> = {}) => {
  const device = {
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
  };
  store.devices.push(device);
  return device;
};

const seedSession = (overrides: Record<string, unknown> = {}) => {
  const session: Record<string, unknown> = {
    id: "session-1",
    userId: USER,
    deviceId: "device-1",
    brewBatchId: "batch-1",
    startedAt: new Date(FIXED_NOW.getTime() - 5 * 24 * HOUR_MS),
    endedAt: null,
    endReason: null,
    calibrationOffsetSg: 0,
    tempMinC: null,
    tempMaxC: null,
    alertsMuted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides
  };
  store.sessions.push(session);
  return session;
};

const seedReading = (overrides: Record<string, unknown> = {}) => {
  const reading: Record<string, unknown> = {
    id: store.readings.length + 1,
    deviceId: "device-1",
    sessionId: "session-1",
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

beforeEach(() => {
  store.devices = [];
  store.sessions = [];
  store.readings = [];
  mocks.addBrewMeasurement.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

describe("applySessionCalibration — F4.1", () => {
  it("интерполирует между соседними точками и офсет = measurementSg − rawDeviceSg", async () => {
    seedDevice();
    seedSession();
    const ts1 = new Date(FIXED_NOW.getTime() - 4 * HOUR_MS);
    const ts2 = new Date(FIXED_NOW.getTime() - 2 * HOUR_MS);
    seedReading({ ts: ts1, gravitySg: 1.05 });
    seedReading({ ts: ts2, gravitySg: 1.04 });
    const measurementTs = new Date(FIXED_NOW.getTime() - 3 * HOUR_MS); // ровно посередине → raw = 1.045

    const result = await applySessionCalibration(USER, {
      sessionId: "session-1",
      measurementTs,
      measurementSg: 1.05
    });

    expect(result.offsetSg).toBeCloseTo(0.005, 6);
    expect(result.previousOffsetSg).toBe(0);
    expect(result.deviceId).toBe("device-1");
    expect(result.brewBatchId).toBe("batch-1");
    expect(store.sessions[0]!.calibrationOffsetSg).toBeCloseTo(0.005, 6);
  });

  it("замер точно на существующей точке — берёт её значение без интерполяции", async () => {
    seedDevice();
    seedSession();
    const ts1 = new Date(FIXED_NOW.getTime() - 4 * HOUR_MS);
    seedReading({ ts: ts1, gravitySg: 1.05 });

    const result = await applySessionCalibration(USER, { sessionId: "session-1", measurementTs: ts1, measurementSg: 1.048 });

    expect(result.offsetSg).toBeCloseTo(-0.002, 6);
  });

  it("замер вне диапазона, но в пределах 2ч от крайней точки — использует ближайшую", async () => {
    seedDevice();
    seedSession();
    const ts1 = new Date(FIXED_NOW.getTime() - 4 * HOUR_MS);
    seedReading({ ts: ts1, gravitySg: 1.05 });
    const measurementTs = new Date(ts1.getTime() - 1.5 * HOUR_MS);

    const result = await applySessionCalibration(USER, { sessionId: "session-1", measurementTs, measurementSg: 1.05 });

    expect(result.offsetSg).toBeCloseTo(0, 6);
  });

  it("замер дальше 2ч от любой точки → CALIBRATION_NO_NEARBY_POINT", async () => {
    seedDevice();
    seedSession();
    const ts1 = new Date(FIXED_NOW.getTime() - 4 * HOUR_MS);
    seedReading({ ts: ts1, gravitySg: 1.05 });
    const measurementTs = new Date(ts1.getTime() - 3 * HOUR_MS);

    await expect(
      applySessionCalibration(USER, { sessionId: "session-1", measurementTs, measurementSg: 1.05 })
    ).rejects.toThrow("CALIBRATION_NO_NEARBY_POINT");
  });

  it("нет ни одной не-excluded точки с гравитацией → CALIBRATION_NO_NEARBY_POINT", async () => {
    seedDevice();
    seedSession();
    seedReading({ excluded: true });
    seedReading({ gravitySg: null });

    await expect(
      applySessionCalibration(USER, { sessionId: "session-1", measurementTs: FIXED_NOW, measurementSg: 1.05 })
    ).rejects.toThrow("CALIBRATION_NO_NEARBY_POINT");
  });

  it("перезапись офсета: второй вызов не накапливает, а считает офсет заново", async () => {
    seedDevice();
    seedSession();
    const ts1 = new Date(FIXED_NOW.getTime() - 4 * HOUR_MS);
    seedReading({ ts: ts1, gravitySg: 1.05 });

    const first = await applySessionCalibration(USER, { sessionId: "session-1", measurementTs: ts1, measurementSg: 1.06 });
    expect(first.offsetSg).toBeCloseTo(0.01, 6);

    const second = await applySessionCalibration(USER, { sessionId: "session-1", measurementTs: ts1, measurementSg: 1.048 });

    expect(second.previousOffsetSg).toBeCloseTo(0.01, 6);
    expect(second.offsetSg).toBeCloseTo(-0.002, 6); // не 0.01 + (-0.002) — офсет всегда с нуля от сырых значений
    expect(store.sessions[0]!.calibrationOffsetSg).toBeCloseTo(-0.002, 6);
  });

  it("чужой/несуществующий сеанс → SESSION_NOT_FOUND", async () => {
    seedSession({ userId: OTHER_USER });

    await expect(
      applySessionCalibration(USER, { sessionId: "session-1", measurementTs: FIXED_NOW, measurementSg: 1.05 })
    ).rejects.toThrow("SESSION_NOT_FOUND");
  });
});

describe("clearSessionCalibration", () => {
  it("сбрасывает офсет в 0 и возвращает прежнее значение", async () => {
    seedDevice();
    seedSession({ calibrationOffsetSg: 0.004 });

    const result = await clearSessionCalibration(USER, "session-1");

    expect(result.offsetSg).toBe(0);
    expect(result.previousOffsetSg).toBe(0.004);
    expect(store.sessions[0]!.calibrationOffsetSg).toBe(0);
  });
});

describe("setReadingsExcluded — F4.2", () => {
  it("исключает точки только в заданном диапазоне и возвращает число задетых", async () => {
    seedDevice();
    seedSession();
    const inRange1 = seedReading({ ts: new Date(FIXED_NOW.getTime() - 3 * HOUR_MS) });
    const inRange2 = seedReading({ ts: new Date(FIXED_NOW.getTime() - 2 * HOUR_MS) });
    const outOfRange = seedReading({ ts: new Date(FIXED_NOW.getTime() - 10 * HOUR_MS) });

    const result = await setReadingsExcluded(USER, {
      sessionId: "session-1",
      fromTs: new Date(FIXED_NOW.getTime() - 4 * HOUR_MS),
      toTs: new Date(FIXED_NOW.getTime() - 1 * HOUR_MS),
      excluded: true
    });

    expect(result.affected).toBe(2);
    expect(inRange1.excluded).toBe(true);
    expect(inRange2.excluded).toBe(true);
    expect(outOfRange.excluded).toBe(false);
  });

  it("обратимо: excluded=false тем же путём возвращает точки", async () => {
    seedDevice();
    seedSession();
    const reading = seedReading({ ts: FIXED_NOW, excluded: true });

    const result = await setReadingsExcluded(USER, {
      sessionId: "session-1",
      fromTs: new Date(FIXED_NOW.getTime() - HOUR_MS),
      toTs: new Date(FIXED_NOW.getTime() + HOUR_MS),
      excluded: false
    });

    expect(result.affected).toBe(1);
    expect(reading.excluded).toBe(false);
  });
});

describe("updateSessionBounds — F4.3", () => {
  it("сдвигает startedAt позже и отвязывает точки старше новой границы", async () => {
    seedDevice();
    seedSession({ startedAt: new Date(FIXED_NOW.getTime() - 5 * HOUR_MS), endedAt: null });
    const before = seedReading({ ts: new Date(FIXED_NOW.getTime() - 4 * HOUR_MS) });
    const after = seedReading({ ts: new Date(FIXED_NOW.getTime() - 1 * HOUR_MS) });
    const newStart = new Date(FIXED_NOW.getTime() - 2 * HOUR_MS);

    const result = await updateSessionBounds(USER, "session-1", { startedAt: newStart });

    expect(result.startedAt.getTime()).toBe(newStart.getTime());
    expect(result.detachedReadingsCount).toBe(1);
    expect(before.sessionId).toBeNull();
    expect(after.sessionId).toBe("session-1");
  });

  it("завершение задним числом активного сеанса ставит endReason='manual' и отвязывает точки позже конца", async () => {
    seedDevice();
    seedSession({ startedAt: new Date(FIXED_NOW.getTime() - 5 * HOUR_MS), endedAt: null, endReason: null });
    const within = seedReading({ ts: new Date(FIXED_NOW.getTime() - 3 * HOUR_MS) });
    const beyond = seedReading({ ts: new Date(FIXED_NOW.getTime() - 30 * 60 * 1000) });
    const newEnd = new Date(FIXED_NOW.getTime() - HOUR_MS);

    const result = await updateSessionBounds(USER, "session-1", { endedAt: newEnd });

    expect(result.endedAt?.getTime()).toBe(newEnd.getTime());
    expect(result.endReason).toBe("manual");
    expect(result.detachedReadingsCount).toBe(1);
    expect(within.sessionId).toBe("session-1");
    expect(beyond.sessionId).toBeNull();
  });

  it("уже завершённый сеанс не меняет endReason при простой правке границ", async () => {
    seedDevice();
    seedSession({
      startedAt: new Date(FIXED_NOW.getTime() - 10 * HOUR_MS),
      endedAt: new Date(FIXED_NOW.getTime() - 5 * HOUR_MS),
      endReason: "batch_completed"
    });

    const result = await updateSessionBounds(USER, "session-1", { startedAt: new Date(FIXED_NOW.getTime() - 9 * HOUR_MS) });

    expect(result.endReason).toBe("batch_completed");
  });

  it("startedAt >= endedAt → SESSION_BOUNDS_INVALID_RANGE", async () => {
    seedDevice();
    seedSession({ startedAt: new Date(FIXED_NOW.getTime() - 5 * HOUR_MS), endedAt: new Date(FIXED_NOW.getTime() - HOUR_MS) });

    await expect(
      updateSessionBounds(USER, "session-1", { startedAt: new Date(FIXED_NOW.getTime() - HOUR_MS + 1000) })
    ).rejects.toThrow("SESSION_BOUNDS_INVALID_RANGE");
  });

  it("endedAt больше чем на минуту в будущем → SESSION_BOUNDS_END_IN_FUTURE", async () => {
    seedDevice();
    seedSession();

    await expect(
      updateSessionBounds(USER, "session-1", { endedAt: new Date(FIXED_NOW.getTime() + 2 * HOUR_MS) })
    ).rejects.toThrow("SESSION_BOUNDS_END_IN_FUTURE");
  });

  it("чужой сеанс → SESSION_NOT_FOUND", async () => {
    seedSession({ userId: OTHER_USER });

    await expect(updateSessionBounds(USER, "session-1", { startedAt: FIXED_NOW })).rejects.toThrow("SESSION_NOT_FOUND");
  });
});

describe("confirmGravityFromCurve — F4.4", () => {
  it("og: медиана первых 6 часов сеанса (минимум 3 точки), note с именем устройства", async () => {
    seedDevice({ name: "Pill в кухне" });
    const startedAt = new Date(FIXED_NOW.getTime() - 10 * HOUR_MS);
    seedSession({ startedAt, calibrationOffsetSg: 0 });
    seedReading({ ts: new Date(startedAt.getTime() + HOUR_MS), gravitySg: 1.05 });
    seedReading({ ts: new Date(startedAt.getTime() + 3 * HOUR_MS), gravitySg: 1.049 });
    seedReading({ ts: new Date(startedAt.getTime() + 5 * HOUR_MS), gravitySg: 1.048 });
    seedReading({ ts: new Date(startedAt.getTime() + 9 * HOUR_MS), gravitySg: 1.03 }); // вне окна 6ч — не должен влиять
    mocks.addBrewMeasurement.mockResolvedValue({ id: "m-1", brewBatchId: "batch-1", gravitySg: 1.049, takenAt: FIXED_NOW, isFinal: false, note: "x", createdAt: FIXED_NOW });

    const result = await confirmGravityFromCurve(USER, { sessionId: "session-1", kind: "og" });

    expect(result.gravitySg).toBeCloseTo(1.049, 6);
    expect(mocks.addBrewMeasurement).toHaveBeenCalledWith(
      USER,
      "batch-1",
      expect.objectContaining({ gravitySg: 1.049, isFinal: false, note: "С устройства Pill в кухне" })
    );
    expect(result.measurement.id).toBe("m-1");
  });

  it("og: меньше 3 точек в окне → CURVE_INSUFFICIENT_POINTS", async () => {
    seedDevice();
    const startedAt = new Date(FIXED_NOW.getTime() - 10 * HOUR_MS);
    seedSession({ startedAt });
    seedReading({ ts: new Date(startedAt.getTime() + HOUR_MS), gravitySg: 1.05 });
    seedReading({ ts: new Date(startedAt.getTime() + 2 * HOUR_MS), gravitySg: 1.049 });

    await expect(confirmGravityFromCurve(USER, { sessionId: "session-1", kind: "og" })).rejects.toThrow(
      "CURVE_INSUFFICIENT_POINTS"
    );
  });

  it("fg: медиана последних 48ч при стабильности (≤0.0015), isFinal=true, takenAt — последняя точка", async () => {
    seedDevice();
    seedSession({ startedAt: new Date(FIXED_NOW.getTime() - 20 * 24 * HOUR_MS) });
    const t1 = new Date(FIXED_NOW.getTime() - 40 * HOUR_MS);
    const t2 = new Date(FIXED_NOW.getTime() - 20 * HOUR_MS);
    const t3 = FIXED_NOW;
    seedReading({ ts: t1, gravitySg: 1.012 });
    seedReading({ ts: t2, gravitySg: 1.0115 });
    seedReading({ ts: t3, gravitySg: 1.0125 }); // размах 0.001 ≤ 0.0015 — стабильно
    mocks.addBrewMeasurement.mockResolvedValue({ id: "m-2", brewBatchId: "batch-1", gravitySg: 1.012, takenAt: t3, isFinal: true, note: "x", createdAt: FIXED_NOW });

    const result = await confirmGravityFromCurve(USER, { sessionId: "session-1", kind: "fg" });

    expect(result.gravitySg).toBeCloseTo(1.012, 6);
    expect(mocks.addBrewMeasurement).toHaveBeenCalledWith(
      USER,
      "batch-1",
      expect.objectContaining({ isFinal: true, takenAt: t3 })
    );
  });

  it("fg: нестабильная кривая (размах >0.0015) → CURVE_NOT_STABLE, замер не создаётся", async () => {
    seedDevice();
    seedSession({ startedAt: new Date(FIXED_NOW.getTime() - 20 * 24 * HOUR_MS) });
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 40 * HOUR_MS), gravitySg: 1.02 });
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 20 * HOUR_MS), gravitySg: 1.015 });
    seedReading({ ts: FIXED_NOW, gravitySg: 1.012 });

    await expect(confirmGravityFromCurve(USER, { sessionId: "session-1", kind: "fg" })).rejects.toThrow("CURVE_NOT_STABLE");
    expect(mocks.addBrewMeasurement).not.toHaveBeenCalled();
  });

  it("применяет calibration_offset_sg сеанса к точкам перед вычислением медианы", async () => {
    seedDevice();
    const startedAt = new Date(FIXED_NOW.getTime() - 10 * HOUR_MS);
    seedSession({ startedAt, calibrationOffsetSg: 0.003 });
    seedReading({ ts: new Date(startedAt.getTime() + HOUR_MS), gravitySg: 1.05 });
    seedReading({ ts: new Date(startedAt.getTime() + 2 * HOUR_MS), gravitySg: 1.05 });
    seedReading({ ts: new Date(startedAt.getTime() + 3 * HOUR_MS), gravitySg: 1.05 });
    mocks.addBrewMeasurement.mockResolvedValue({ id: "m-3", brewBatchId: "batch-1", gravitySg: 1.053, takenAt: FIXED_NOW, isFinal: false, note: "x", createdAt: FIXED_NOW });

    const result = await confirmGravityFromCurve(USER, { sessionId: "session-1", kind: "og" });

    expect(result.gravitySg).toBeCloseTo(1.053, 6);
  });
});

describe("previewGravityFromCurve — F4.4 (M3-C, предпросмотр без записи)", () => {
  it("og: та же медиана, что confirmGravityFromCurve, но addBrewMeasurement не вызывается", async () => {
    seedDevice();
    const startedAt = new Date(FIXED_NOW.getTime() - 10 * HOUR_MS);
    seedSession({ startedAt, calibrationOffsetSg: 0 });
    seedReading({ ts: new Date(startedAt.getTime() + HOUR_MS), gravitySg: 1.05 });
    seedReading({ ts: new Date(startedAt.getTime() + 3 * HOUR_MS), gravitySg: 1.049 });
    seedReading({ ts: new Date(startedAt.getTime() + 5 * HOUR_MS), gravitySg: 1.048 });

    const result = await previewGravityFromCurve(USER, { sessionId: "session-1", kind: "og" });

    expect(result).toBeCloseTo(1.049, 6);
    expect(mocks.addBrewMeasurement).not.toHaveBeenCalled();
  });

  it("og: меньше 3 точек в окне → null, не бросает", async () => {
    seedDevice();
    const startedAt = new Date(FIXED_NOW.getTime() - 10 * HOUR_MS);
    seedSession({ startedAt });
    seedReading({ ts: new Date(startedAt.getTime() + HOUR_MS), gravitySg: 1.05 });

    const result = await previewGravityFromCurve(USER, { sessionId: "session-1", kind: "og" });

    expect(result).toBeNull();
  });

  it("fg: нестабильная кривая → null (не CURVE_NOT_STABLE-исключение)", async () => {
    seedDevice();
    seedSession({ startedAt: new Date(FIXED_NOW.getTime() - 20 * 24 * HOUR_MS) });
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 40 * HOUR_MS), gravitySg: 1.02 });
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 20 * HOUR_MS), gravitySg: 1.015 });
    seedReading({ ts: FIXED_NOW, gravitySg: 1.012 });

    const result = await previewGravityFromCurve(USER, { sessionId: "session-1", kind: "fg" });

    expect(result).toBeNull();
  });

  it("чужой/несуществующий сеанс → null, не бросает", async () => {
    seedSession({ userId: OTHER_USER });

    const result = await previewGravityFromCurve(USER, { sessionId: "session-1", kind: "og" });

    expect(result).toBeNull();
  });
});

describe("countSessionReadingsInRange / deleteSessionReadings / deleteSessionData — F4.5", () => {
  it("countSessionReadingsInRange считает точки в диапазоне (и без диапазона — все)", async () => {
    seedDevice();
    seedSession();
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 3 * HOUR_MS) });
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 1 * HOUR_MS) });
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 10 * HOUR_MS) });

    const all = await countSessionReadingsInRange(USER, "session-1");
    const ranged = await countSessionReadingsInRange(
      USER,
      "session-1",
      new Date(FIXED_NOW.getTime() - 4 * HOUR_MS),
      new Date(FIXED_NOW.getTime())
    );

    expect(all).toBe(3);
    expect(ranged).toBe(2);
  });

  it("deleteSessionReadings удаляет точки диапазона и возвращает число удалённых, не трогая остальные", async () => {
    seedDevice();
    seedSession();
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 3 * HOUR_MS) });
    const keep = seedReading({ ts: new Date(FIXED_NOW.getTime() - 10 * HOUR_MS) });

    const result = await deleteSessionReadings(USER, {
      sessionId: "session-1",
      fromTs: new Date(FIXED_NOW.getTime() - 4 * HOUR_MS),
      toTs: FIXED_NOW
    });

    expect(result.deletedCount).toBe(1);
    expect(store.readings).toHaveLength(1);
    expect(store.readings[0]).toBe(keep);
  });

  it("deleteSessionReadings без диапазона удаляет все точки сеанса", async () => {
    seedDevice();
    seedSession();
    seedReading();
    seedReading({ ts: new Date(FIXED_NOW.getTime() - 20 * HOUR_MS) });

    const result = await deleteSessionReadings(USER, { sessionId: "session-1" });

    expect(result.deletedCount).toBe(2);
    expect(store.readings).toHaveLength(0);
  });

  it("deleteSessionData удаляет и точки, и сам сеанс, не трогая чужие сеансы/точки", async () => {
    seedDevice();
    seedSession({ id: "session-1" });
    seedSession({ id: "session-2" });
    seedReading({ sessionId: "session-1" });
    const otherReading = seedReading({ sessionId: "session-2" });

    const result = await deleteSessionData(USER, "session-1");

    expect(result.deletedReadingsCount).toBe(1);
    expect(store.sessions.map((s) => s.id)).toEqual(["session-2"]);
    expect(store.readings).toEqual([otherReading]);
  });

  it("чужой сеанс → SESSION_NOT_FOUND (countSessionReadingsInRange/delete*)", async () => {
    seedSession({ userId: OTHER_USER });

    await expect(countSessionReadingsInRange(USER, "session-1")).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(deleteSessionReadings(USER, { sessionId: "session-1" })).rejects.toThrow("SESSION_NOT_FOUND");
    await expect(deleteSessionData(USER, "session-1")).rejects.toThrow("SESSION_NOT_FOUND");
  });
});
