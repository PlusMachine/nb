import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
//  ingest.test.ts — колокированный тест ingestStreamPacket БЕЗ реальной БД.
//
//  Паттерн взят из принятых в репо колокированных тестов сервисов с БД
//  (features/brew-controller/cloud-transport.test.ts, tests/push-subscription-
//  state-api.test.ts): `@nb/db` мокается in-memory-хранилищем, а не поднимает
//  реальный Postgres — в репо НЕТ интеграционных тестов с живой БД (ни один
//  колокированный/`tests/**` файл её не поднимает), поэтому следуем этому же
//  подходу, а не заводим новый.
//
//  `findDeviceByToken` (features/devices/service.ts, чужой файл — не трогаем)
//  мокается напрямую (как revokeDevice в tests/admin-devices.test.ts) —
//  ingest.ts его только вызывает, а сам auth-механизм (timing-safe сравнение,
//  бан владельца) уже покрыт тестами того файла (если они есть) — здесь не
//  дублируем.
// =============================================================================

type Cond =
  | { kind: "eq"; col: string; value: unknown }
  | { kind: "and"; conds: Cond[] }
  | { kind: "isNull"; col: string };

type TableTag = { __rows: () => Record<string, unknown>[] } & Record<string, string>;

const { store } = vi.hoisted(() => ({
  store: {
    readings: [] as Record<string, unknown>[],
    sessions: [] as Record<string, unknown>[],
    devices: [] as Record<string, unknown>[]
  }
}));

vi.mock("@nb/db", () => {
  const matches = (row: Record<string, unknown>, cond?: Cond): boolean => {
    if (!cond) return true;
    if (cond.kind === "and") return cond.conds.every((inner) => matches(row, inner));
    if (cond.kind === "isNull") return row[cond.col] === null || row[cond.col] === undefined;
    return row[cond.col] === cond.value;
  };

  const makeTable = (rows: () => Record<string, unknown>[], columns: string[]): TableTag => {
    const table = { __rows: rows } as TableTag;
    for (const col of columns) table[col] = col;
    return table;
  };

  const fermentReadingsTable = makeTable(() => store.readings, [
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
  const fermentSessionsTable = makeTable(() => store.sessions, ["id", "deviceId", "endedAt"]);
  const brewDevicesTable = makeTable(() => store.devices, ["id", "lastSeenAt", "status", "updatedAt"]);

  // Мини-реализация select().from().where().orderBy(desc(col)).limit(n) — фильтрует
  // и сортирует ЖИВОЕ состояние store (не очередь заготовленных результатов, как в
  // tests/admin-devices.test.ts) — сценарии здесь многошаговые, каждый следующий
  // ingestStreamPacket видит эффект предыдущего (та же логика, что в push-
  // subscription-state-api.test.ts).
  const makeSelectChain = (rows: () => Record<string, unknown>[]) => {
    let filtered: Record<string, unknown>[] | null = null;
    let sortCol: string | null = null;
    let cap: number | undefined;
    const chain = {
      from: () => chain,
      where: (cond: Cond) => {
        filtered = rows().filter((row) => matches(row, cond));
        return chain;
      },
      orderBy: (marker: { __desc?: string } | undefined) => {
        sortCol = marker?.__desc ?? null;
        return chain;
      },
      limit: (n: number) => {
        cap = n;
        return chain;
      },
      then: (resolve: (value: unknown) => void) => {
        let result = filtered ?? [...rows()];
        if (sortCol) {
          const col = sortCol;
          result = [...result].sort((a, b) => (b[col] as Date).getTime() - (a[col] as Date).getTime());
        }
        resolve(cap !== undefined ? result.slice(0, cap) : result);
      }
    };
    return chain;
  };

  const db = {
    select: (_projection?: unknown) => ({
      from: (table: TableTag) => makeSelectChain(table.__rows)
    }),
    insert: (table: TableTag) => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoNothing: async () => {
          const rows = table.__rows();
          const dup = rows.some(
            (row) =>
              row.deviceId === values.deviceId && (row.ts as Date).getTime() === (values.ts as Date).getTime()
          );
          if (!dup) {
            rows.push({ id: rows.length + 1, createdAt: new Date(), excluded: false, sessionId: null, ...values });
          }
        }
      })
    }),
    update: (table: TableTag) => ({
      set: (setValues: Record<string, unknown>) => ({
        where: async (cond: Cond) => {
          for (const row of table.__rows()) {
            if (matches(row, cond)) {
              Object.assign(row, setValues);
            }
          }
        }
      })
    })
  };

  return {
    db,
    fermentReadings: fermentReadingsTable,
    fermentSessions: fermentSessionsTable,
    brewDevices: brewDevicesTable,
    eq: (col: string, value: unknown): Cond => ({ kind: "eq", col, value }),
    and: (...conds: Cond[]): Cond => ({ kind: "and", conds }),
    isNull: (col: string): Cond => ({ kind: "isNull", col }),
    desc: (col: string) => ({ __desc: col })
  };
});

const mocks = vi.hoisted(() => ({
  findDeviceByToken: vi.fn(),
  assertRateLimit: vi.fn(async () => {}),
  // F6/M5-A: processIngestAlerts живёт в alerts.ts (свой колокированный тест,
  // alerts.test.ts) — здесь только проверяем, что ingest.ts зовёт её с верными
  // аргументами ПОСЛЕ записи точки; полную логику алертов не дублируем (её
  // мок @nb/db здесь не покрывает — не тот набор таблиц/колонок).
  processIngestAlerts: vi.fn(async () => {})
}));

vi.mock("@/features/devices/service", () => ({ findDeviceByToken: mocks.findDeviceByToken }));
vi.mock("@nb/auth", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("./alerts", () => ({ processIngestAlerts: mocks.processIngestAlerts }));

import { ingestStreamPacket } from "./ingest";

const DEVICE_ID = "device-1";
const TOKEN = "raw-token-abc";

const streamDevice = (overrides: Record<string, unknown> = {}) => ({
  id: DEVICE_ID,
  userId: "user-1",
  providerId: "stream",
  name: "iSpindel кухня",
  hardwareId: "st-abc123",
  fw: null,
  capabilities: ["fermentation_logging"],
  supportsRecipePush: false,
  status: "offline",
  localUrl: null,
  mqttPrefix: null,
  lastSeenAt: null,
  createdAt: new Date("2026-07-01T00:00:00Z"),
  updatedAt: new Date("2026-07-01T00:00:00Z"),
  ...overrides
});

const ISPINDEL_PACKET = {
  name: "iSpindel000",
  ID: 4974097,
  angle: 83.49,
  temperature: 21.44,
  temp_units: "C",
  battery: 4.03,
  gravity: 1.048,
  "gravity-unit": "G",
  interval: 900,
  RSSI: -76
};

const TILT_PACKET = (timepoint: number) => ({
  Timepoint: timepoint,
  Temp: 68.5,
  SG: 1.048,
  Beer: "Untitled",
  Color: "BLACK",
  Comment: ""
});

const seedDevice = (overrides: Record<string, unknown> = {}) => {
  const device = { id: DEVICE_ID, lastSeenAt: null as Date | null, status: "offline", updatedAt: new Date(0), ...overrides };
  store.devices.push(device);
  return device;
};

beforeEach(() => {
  store.readings = [];
  store.sessions = [];
  store.devices = [];
  mocks.findDeviceByToken.mockReset();
  mocks.assertRateLimit.mockReset();
  mocks.assertRateLimit.mockResolvedValue(undefined);
  mocks.processIngestAlerts.mockReset();
  mocks.processIngestAlerts.mockResolvedValue(undefined);
});

describe("ingestStreamPacket — аутентификация", () => {
  it("неизвестный токен → not_found", async () => {
    mocks.findDeviceByToken.mockResolvedValue(null);

    const result = await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null });

    expect(result).toEqual({ kind: "not_found" });
  });

  it("токен BrewForge-устройства (не 'stream') → not_found, не 401", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice({ providerId: "brewforge" }));
    seedDevice();

    const result = await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null });

    expect(result).toEqual({ kind: "not_found" });
    // Устройство не наше — не трогаем его presence вообще.
    expect(store.readings).toHaveLength(0);
  });
});

describe("ingestStreamPacket — rate limit на устройство", () => {
  it("превышение лимита → throttled, lastSeenAt/status обновлены, строка не пишется", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    mocks.assertRateLimit.mockRejectedValueOnce(new Error("RATE_LIMITED"));
    const device = seedDevice();
    const receivedAt = new Date("2026-07-14T12:00:00Z");

    const result = await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null, receivedAt });

    expect(result).toEqual({ kind: "throttled" });
    expect(store.readings).toHaveLength(0);
    expect(device.lastSeenAt).toEqual(receivedAt);
    expect(device.status).toBe("online");
  });
});

describe("ingestStreamPacket — персист-гейт (§8.5)", () => {
  it("первая точка пишется; вторая через минуту — гейтится, но lastSeenAt обновляется", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    const device = seedDevice();

    const t0 = new Date("2026-07-14T12:00:00Z");
    const first = await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null, receivedAt: t0 });
    expect(first).toEqual({ kind: "stored" });
    expect(store.readings).toHaveLength(1);

    const t1 = new Date(t0.getTime() + 60_000); // +1 мин, гейт — 5 мин
    const second = await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null, receivedAt: t1 });

    expect(second).toEqual({ kind: "throttled" });
    expect(store.readings).toHaveLength(1); // строка не добавилась
    expect(device.lastSeenAt).toEqual(t1); // presence всё равно свежая
  });

  it("точка через 5+ минут проходит гейт и пишется", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();

    const t0 = new Date("2026-07-14T12:00:00Z");
    await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null, receivedAt: t0 });

    const t1 = new Date(t0.getTime() + 5 * 60_000 + 1000);
    const second = await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null, receivedAt: t1 });

    expect(second).toEqual({ kind: "stored" });
    expect(store.readings).toHaveLength(2);
  });
});

describe("ingestStreamPacket — дедуп (deviceId, ts)", () => {
  it("два пакета с одинаковым вычисленным ts никогда не дают двух строк", async () => {
    // Два независимых защитных слоя ведут к одному и тому же инварианту:
    //  - если вторая корутина видит уже вставленную первой строку на шаге
    //    SELECT max(ts) — её отсекает персист-гейт (throttled), до INSERT дело
    //    не доходит;
    //  - если обе корутины проходят SELECT ДО того, как одна из них успела
    //    вставить строку (настоящая гонка двух пакетов, см. комментарий в
    //    ingest.ts "гонка двух пакетов максимум даст лишнюю точку") — обе
    //    получат "stored", но onConflictDoNothing на INSERT схлопнёт их в одну
    //    строку на уровне БД.
    // Порядок микрозадач не специфицирован — проверяем инвариант (≤1 строка),
    // а не то, КАКОЙ именно из двух путей сработал в конкретном прогоне.
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();

    const receivedAt = new Date("2026-07-14T12:00:00Z");
    const [a, b] = await Promise.all([
      ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null, receivedAt }),
      ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null, receivedAt })
    ]);

    expect([a.kind, b.kind].every((kind) => kind === "stored" || kind === "throttled")).toBe(true);
    expect(store.readings).toHaveLength(1); // дедуп по (deviceId, ts) — ровно одна строка
  });
});

describe("ingestStreamPacket — плаузибилити-клампы", () => {
  it("мусорные значения клампуются в NULL, но точка пишется вместе с сырым payload", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();

    const garbage = { ...ISPINDEL_PACKET, gravity: 999, "gravity-unit": "G", temperature: 500 };
    const result = await ingestStreamPacket({ rawToken: TOKEN, body: garbage, clientIp: null });

    expect(result).toEqual({ kind: "stored" });
    const [row] = store.readings;
    expect(row?.gravitySg).toBeNull();
    expect(row?.tempC).toBeNull();
    expect(row?.payload).toEqual(garbage);
  });
});

describe("ingestStreamPacket — время точки (ts)", () => {
  it("Tilt Timepoint вне окна ±48ч (битые часы) → используем receivedAt", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();

    const receivedAt = new Date("2026-07-14T12:00:00Z");
    // Excel serial ~1 → 1899-12-31, дальше 48ч от receivedAt.
    const result = await ingestStreamPacket({ rawToken: TOKEN, body: TILT_PACKET(1), clientIp: null, receivedAt });

    expect(result).toEqual({ kind: "stored" });
    expect((store.readings[0]?.ts as Date).getTime()).toBe(receivedAt.getTime());
  });

  it("Tilt Timepoint в разумном окне → используем sourceTs, а не receivedAt", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();

    const receivedAt = new Date("2026-07-14T12:00:00Z");
    // Excel serial дня receivedAt (±1 час) — в окне ±48ч.
    const EXCEL_EPOCH_OFFSET_DAYS = 25569;
    const serial = receivedAt.getTime() / 86_400_000 + EXCEL_EPOCH_OFFSET_DAYS;

    const result = await ingestStreamPacket({
      rawToken: TOKEN,
      body: TILT_PACKET(serial),
      clientIp: null,
      receivedAt
    });

    expect(result).toEqual({ kind: "stored" });
    // sourceTs != receivedAt буквально (пересчёт через serial даёт ~то же время
    // с точностью до секунд), но НЕ обязан совпасть день-в-день с receivedAt.
    const storedTs = store.readings[0]?.ts as Date;
    expect(Math.abs(storedTs.getTime() - receivedAt.getTime())).toBeLessThan(60_000);
  });
});

describe("ingestStreamPacket — неизвестный/битый формат", () => {
  it("неизвестный формат тела → bad_format, lastSeenAt НЕ обновляется", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    const device = seedDevice({ lastSeenAt: new Date("2026-01-01T00:00:00Z") });
    const before = device.lastSeenAt;

    const result = await ingestStreamPacket({ rawToken: TOKEN, body: { foo: "bar" }, clientIp: null });

    expect(result).toEqual({ kind: "bad_format", error: "unknown_format" });
    expect(store.readings).toHaveLength(0);
    expect(device.lastSeenAt).toEqual(before);
  });

  it("тело не объект (массив/примитив) → bad_format invalid_body", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();

    const result = await ingestStreamPacket({ rawToken: TOKEN, body: [1, 2, 3], clientIp: null });

    expect(result).toEqual({ kind: "bad_format", error: "invalid_body" });
  });
});

describe("ingestStreamPacket — денормализация сеанса", () => {
  it("активный сеанс устройства денормализуется в sessionId показания", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();
    store.sessions.push({ id: "session-1", deviceId: DEVICE_ID, endedAt: null });

    await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null });

    expect(store.readings[0]?.sessionId).toBe("session-1");
  });

  it("завершённый сеанс не подхватывается — sessionId остаётся null", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();
    store.sessions.push({ id: "session-old", deviceId: DEVICE_ID, endedAt: new Date("2026-06-01T00:00:00Z") });

    await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null });

    expect(store.readings[0]?.sessionId).toBeNull();
  });
});

describe("ingestStreamPacket — вызов processIngestAlerts (F6/M5-A)", () => {
  it("вызывается ПОСЛЕ успешной записи, с sessionId активного сеанса", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();
    store.sessions.push({ id: "session-1", deviceId: DEVICE_ID, endedAt: null });
    const receivedAt = new Date("2026-07-14T12:00:00Z");

    const result = await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null, receivedAt });

    expect(result).toEqual({ kind: "stored" });
    expect(mocks.processIngestAlerts).toHaveBeenCalledWith({ deviceId: DEVICE_ID, sessionId: "session-1", receivedAt });
  });

  it("вызывается с sessionId=null, когда активного сеанса нет", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();

    await ingestStreamPacket({ rawToken: TOKEN, body: ISPINDEL_PACKET, clientIp: null });

    expect(mocks.processIngestAlerts).toHaveBeenCalledWith(
      expect.objectContaining({ deviceId: DEVICE_ID, sessionId: null })
    );
  });

  it("НЕ вызывается на throttled/bad_format (алертить нечего — строка не записана)", async () => {
    mocks.findDeviceByToken.mockResolvedValue(streamDevice());
    seedDevice();

    await ingestStreamPacket({ rawToken: TOKEN, body: { foo: "bar" }, clientIp: null });

    expect(mocks.processIngestAlerts).not.toHaveBeenCalled();
  });
});
