import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
//  series.test.ts — колокированный тест проводки Ф3б/Ф3в в readBatchFermentSeries
//  БЕЗ реальной БД. Паттерн зеркалит integrations.test.ts (Proxy-токены колонок +
//  innerJoin fermentSessions↔brewDevices, tests/admin-users-device-token.test.ts).
//  getBrewBatchById/listBrewMeasurements (features/brew-batches/service, чужой
//  файл) мокаются напрямую — здесь проверяется только то, что series.ts решает
//  на основе batch.status и isFinal-замера (computeBatchFermentVerdict), а не
//  логика самого сервиса партий. Сценарии без сеансов устройства — им флаги
//  batchCompleted/fgConfirmed не нужны, они прокидываются ДО чтения кривой.
// =============================================================================

type Row = Record<string, unknown>;
type ColumnRef = { __column: true; table: string; name: string };
type Clause = { op: "eq"; column: ColumnRef; value: unknown } | { op: "and"; args: Clause[] };

const { store } = vi.hoisted(() => ({
  store: {
    sessions: [] as Row[],
    devices: [] as Row[]
  }
}));

vi.mock("@nb/db", () => {
  const tableRows = (name: string): Row[] => {
    if (name === "fermentSessions") return store.sessions;
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

  // Мини-select: from().innerJoin().where().orderBy() — store всегда пуст в этих тестах
  // (нет сеансов устройства), поэтому orderBy — no-op, сортировать нечего.
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
      orderBy: () => builder,
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const matched = work.filter((item) => matches(item, where));
        if (!projection) {
          return Promise.resolve(matched.map((item) => ({ ...item[baseTable] }))).then(onFulfilled, onRejected);
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

  return {
    db: { select: (projection?: Record<string, unknown>) => selectBuilder(projection) },
    brewDevices: tableToken("brewDevices"),
    fermentSessions: tableToken("fermentSessions"),
    fermentReadings: tableToken("fermentReadings"),
    eq: (column: ColumnRef, value: unknown): Clause => ({ op: "eq", column, value }),
    and: (...args: Clause[]): Clause => ({ op: "and", args }),
    asc: () => null,
    inArray: (): Clause => ({ op: "and", args: [] })
  };
});

const mocks = vi.hoisted(() => ({
  getBrewBatchById: vi.fn(),
  listBrewMeasurements: vi.fn()
}));

vi.mock("@/features/brew-batches/service", () => ({
  getBrewBatchById: mocks.getBrewBatchById,
  listBrewMeasurements: mocks.listBrewMeasurements
}));

import { readBatchFermentSeries } from "./series";

const USER = "user-1";
const BATCH_ID = "batch-1";

const brewBatch = (overrides: Record<string, unknown> = {}) => ({
  id: BATCH_ID,
  userId: USER,
  status: "fermenting",
  recipeSnapshot: null as Record<string, unknown> | null,
  ...overrides
});

const measurement = (overrides: Record<string, unknown> = {}) => ({
  id: "measurement-1",
  brewBatchId: BATCH_ID,
  gravitySg: 1.012,
  takenAt: new Date("2026-07-10T12:00:00Z"),
  isFinal: false,
  note: null,
  createdAt: new Date("2026-07-10T12:00:00Z"),
  ...overrides
});

beforeEach(() => {
  store.sessions.length = 0;
  store.devices.length = 0;
  mocks.getBrewBatchById.mockReset();
  mocks.listBrewMeasurements.mockReset();
  mocks.listBrewMeasurements.mockResolvedValue([]);
});

describe("readBatchFermentSeries — Ф3б/Ф3в проводка (мок @nb/db, без реальной БД)", () => {
  it("batch.status === completed → summary.verdict = batch_completed, без сеансов и замеров", async () => {
    mocks.getBrewBatchById.mockResolvedValue(brewBatch({ status: "completed" }));

    const result = await readBatchFermentSeries(USER, BATCH_ID);

    expect(result.summary.verdict).toEqual({ kind: "batch_completed" });
  });

  it("ручной замер isFinal → summary.verdict = fg_confirmed, партия ещё fermenting", async () => {
    mocks.getBrewBatchById.mockResolvedValue(brewBatch({ status: "fermenting" }));
    mocks.listBrewMeasurements.mockResolvedValue([measurement({ isFinal: true })]);

    const result = await readBatchFermentSeries(USER, BATCH_ID);

    expect(result.summary.verdict).toEqual({ kind: "fg_confirmed" });
  });

  it("completed + isFinal одновременно → batch_completed побеждает (тот же приоритет, что в verdict-core)", async () => {
    mocks.getBrewBatchById.mockResolvedValue(brewBatch({ status: "completed" }));
    mocks.listBrewMeasurements.mockResolvedValue([measurement({ isFinal: true })]);

    const result = await readBatchFermentSeries(USER, BATCH_ID);

    expect(result.summary.verdict).toEqual({ kind: "batch_completed" });
  });

  it("регрессия: fermenting без isFinal-замера и без сеансов — прежнее поведение (insufficient_data)", async () => {
    mocks.getBrewBatchById.mockResolvedValue(brewBatch({ status: "fermenting" }));

    const result = await readBatchFermentSeries(USER, BATCH_ID);

    expect(result.summary.verdict).toEqual({ kind: "insufficient_data" });
  });
});
