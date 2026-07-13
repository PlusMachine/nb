import { beforeEach, describe, expect, it, vi } from "vitest";

// Устройства BrewForge авторизуются bearer-токеном, а не сессией: гейт блокировки
// из getUserBySessionToken их не закрывает. Проверяем, что findDeviceByToken сам
// смотрит на владельца — иначе пивоварня забаненного продолжит слать телеметрию
// и качать OTA.

type Row = Record<string, unknown>;

type ColumnRef = { table: string; name: string };

type Clause =
  | { op: "eq"; column: ColumnRef; value: unknown }
  | { op: "and"; args: Clause[] }
  | { op: "or"; args: Clause[] };

const { state } = vi.hoisted(() => ({
  state: { devices: [] as Row[], users: [] as Row[] }
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
    );

  const isTable = (value: unknown): value is { __table: string } =>
    typeof value === "object" && value !== null && "__table" in (value as Record<string, unknown>);

  const isColumn = (value: unknown): value is { table: string; name: string } =>
    typeof value === "object" && value !== null && "__column" in (value as Record<string, unknown>);

  const tableRows = (name: string): Row[] => (name === "users" ? state.users : state.devices);

  const matches = (work: Record<string, Row>, clause: Clause | undefined): boolean => {
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
    const right = isColumn(clause.value) ? work[clause.value.table]?.[clause.value.name] : clause.value;
    return row[clause.column.name] === right;
  };

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
      limit: () => builder,
      then: (onFulfilled: (rows: unknown) => unknown, onRejected?: (reason: unknown) => unknown) => {
        const rows = work
          .filter((item) => matches(item, where))
          .map((item) => {
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

  return {
    db: { select: (projection?: Record<string, unknown>) => selectBuilder(projection) },
    users: tableToken("users"),
    brewDevices: tableToken("brewDevices"),
    brewTelemetry: tableToken("brewTelemetry"),
    devicePairingTokens: tableToken("devicePairingTokens"),
    and: (...args: Clause[]) => ({ op: "and", args }),
    or: (...args: Clause[]) => ({ op: "or", args }),
    eq: (column: unknown, value: unknown) => ({ op: "eq", column, value }),
    gt: (column: unknown, value: unknown) => ({ op: "gt", column, value }),
    gte: (column: unknown, value: unknown) => ({ op: "gte", column, value }),
    desc: (column: unknown) => ({ op: "desc", column }),
    isNull: (column: unknown) => ({ op: "isNull", column }),
    sql: () => ({ op: "sql" })
  };
});

import { hashToken } from "@nb/auth";

import { findDeviceByToken } from "../features/devices/service";

const TOKEN = "device-bearer-token";

const seedOwner = (overrides: Row = {}) => {
  state.users = [
    {
      id: "owner-1",
      displayName: "Пивовар",
      blockedAt: null,
      anonymizedAt: null,
      ...overrides
    }
  ];
};

beforeEach(() => {
  seedOwner();
  state.devices = [
    {
      id: "device-1",
      userId: "owner-1",
      providerId: "brewforge",
      name: "Пивоварня",
      hardwareId: "hw-1",
      tokenHash: hashToken(TOKEN),
      tokenEncrypted: null,
      fw: "1.0.0",
      updateNotifiedFw: null,
      capabilities: [],
      status: "online",
      localUrl: null,
      mqttPrefix: null,
      lastSeenAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    }
  ];
});

describe("findDeviceByToken", () => {
  it("находит устройство активного владельца", async () => {
    await expect(findDeviceByToken(TOKEN)).resolves.toMatchObject({ id: "device-1", userId: "owner-1" });
  });

  it("чужой токен не проходит", async () => {
    await expect(findDeviceByToken("не тот токен")).resolves.toBeNull();
    await expect(findDeviceByToken("")).resolves.toBeNull();
  });

  it("устройство заблокированного владельца не находится", async () => {
    seedOwner({ blockedAt: new Date() });

    await expect(findDeviceByToken(TOKEN)).resolves.toBeNull();
  });

  it("устройство обезличенного владельца не находится", async () => {
    seedOwner({ anonymizedAt: new Date() });

    await expect(findDeviceByToken(TOKEN)).resolves.toBeNull();
  });
});
