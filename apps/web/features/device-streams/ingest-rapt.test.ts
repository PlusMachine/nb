import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
//  ingest-rapt.test.ts — колокированный тест ingestRaptWebhook БЕЗ реальной БД.
//
//  Паттерн зеркалит ingest.test.ts (живое in-memory состояние `@nb/db`,
//  проекции игнорируются и возвращают полные строки — во всех вызовах этого
//  файла алиас проекции совпадает с именем колонки, кроме `count()`, для
//  которого есть отдельная ветка). `findRaptIntegrationByToken` (integrations.ts,
//  чужой файл в смысле «эта проверка уже покрыта его тестами») мокается
//  напрямую — сюда попадает только УЖЕ авторизованный integrationId/userId;
//  сценарий «забаненный владелец» проверен в integrations.test.ts.
// =============================================================================

type Cond =
  | { kind: "eq"; col: string; value: unknown }
  | { kind: "and"; conds: Cond[] }
  | { kind: "isNull"; col: string }
  | { kind: "inArray"; col: string; values: unknown[] };

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
    if (cond.kind === "inArray") return cond.values.includes(row[cond.col]);
    return row[cond.col] === cond.value;
  };

  const makeTable = (rows: () => Record<string, unknown>[], columns: string[]): TableTag => {
    const table = { __rows: rows } as TableTag;
    for (const col of columns) table[col] = col;
    return table;
  };

  const fermentReadingsTable = makeTable(() => store.readings, [
    "id", "deviceId", "sessionId", "ts", "gravitySg", "tempC", "pressureKpa",
    "batteryV", "batteryPct", "rssi", "excluded", "payload", "createdAt"
  ]);
  const fermentSessionsTable = makeTable(() => store.sessions, ["id", "deviceId", "endedAt"]);
  const brewDevicesTable = makeTable(() => store.devices, [
    "id", "userId", "providerId", "name", "hardwareId", "hardwareKind",
    "tokenHash", "tokenEncrypted", "capabilities", "status", "lastSeenAt", "updatedAt", "createdAt"
  ]);

  const COUNT_MARKER = { __count: true };

  const makeSelectChain = (rows: () => Record<string, unknown>[], projection?: Record<string, unknown>) => {
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
        if (cap !== undefined) result = result.slice(0, cap);

        if (projection) {
          const countKey = Object.keys(projection).find((key) => projection[key] === COUNT_MARKER);
          if (countKey) {
            resolve([{ [countKey]: result.length }]);
            return;
          }
        }
        resolve(result);
      }
    };
    return chain;
  };

  const db = {
    select: (projection?: Record<string, unknown>) => ({
      from: (table: TableTag) => makeSelectChain(table.__rows, projection)
    }),
    insert: (table: TableTag) => ({
      values: (values: Record<string, unknown>) => {
        const record = {
          id: `id-${table.__rows().length + 1}`,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastSeenAt: null,
          excluded: false,
          sessionId: null,
          ...values
        };
        return {
          onConflictDoNothing: async () => {
            const rows = table.__rows();
            const dup = rows.some(
              (row) =>
                row.deviceId === values.deviceId && (row.ts as Date)?.getTime?.() === (values.ts as Date)?.getTime?.()
            );
            if (!dup) rows.push(record);
          },
          returning: async () => {
            table.__rows().push(record);
            return [record];
          }
        };
      }
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
    inArray: (col: string, values: unknown[]): Cond => ({ kind: "inArray", col, values }),
    desc: (col: string) => ({ __desc: col }),
    count: () => COUNT_MARKER
  };
});

const mocks = vi.hoisted(() => ({
  findRaptIntegrationByToken: vi.fn(),
  assertRateLimit: vi.fn(async () => {}),
  // F6/M5-A: processIngestAlerts — свой файл/свой тест (alerts.test.ts); здесь
  // мокаем, т.к. этот файл @nb/db-мок не покрывает набор таблиц/колонок, нужных
  // alerts.ts (brewBatches и т.п.) — проверяем только факт и аргументы вызова.
  processIngestAlerts: vi.fn(async () => {})
}));

vi.mock("@/features/device-streams/integrations", () => ({
  findRaptIntegrationByToken: mocks.findRaptIntegrationByToken
}));
vi.mock("@nb/auth", () => ({ assertRateLimit: mocks.assertRateLimit }));
vi.mock("./alerts", () => ({ processIngestAlerts: mocks.processIngestAlerts }));

import { ingestRaptWebhook } from "./ingest-rapt";

const TOKEN = "raw-rapt-token";
const INTEGRATION_ID = "integration-1";
const USER_ID = "user-1";

const raptPayload = (overrides: Record<string, unknown> = {}) => ({
  device_id: "AA:BB:CC",
  device_type: "RAPT Pill",
  device_name: "Pill кухня",
  temperature: "19.4",
  gravity: "1.048",
  battery: "87",
  rssi: "-70",
  ts: "2026-07-14T12:00:00.000Z",
  ...overrides
});

beforeEach(() => {
  store.readings = [];
  store.sessions = [];
  store.devices = [];
  mocks.findRaptIntegrationByToken.mockReset();
  mocks.findRaptIntegrationByToken.mockResolvedValue({ id: INTEGRATION_ID, userId: USER_ID });
  mocks.assertRateLimit.mockReset();
  mocks.assertRateLimit.mockResolvedValue(undefined);
  mocks.processIngestAlerts.mockReset();
  mocks.processIngestAlerts.mockResolvedValue(undefined);
});

describe("ingestRaptWebhook — аутентификация", () => {
  it("неизвестный/чужой токен → not_found (в т.ч. случай забаненного владельца — покрыт integrations.test.ts)", async () => {
    mocks.findRaptIntegrationByToken.mockResolvedValue(null);

    const result = await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null });

    expect(result).toEqual({ kind: "not_found" });
    expect(store.devices).toHaveLength(0);
  });
});

describe("ingestRaptWebhook — rate limit на подключение", () => {
  it("превышение лимита → throttled, без похода за устройством", async () => {
    mocks.assertRateLimit.mockRejectedValueOnce(new Error("RATE_LIMITED"));

    const result = await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null });

    expect(result).toEqual({ kind: "throttled" });
    expect(store.devices).toHaveLength(0);
    expect(mocks.assertRateLimit).toHaveBeenCalledWith(`rapt:${INTEGRATION_ID}`, "rapt_ingest", 60, 60);
  });
});

describe("ingestRaptWebhook — bad_format", () => {
  it("device_id отсутствует → bad_format", async () => {
    const result = await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload({ device_id: "" }), clientIp: null });
    expect(result).toEqual({ kind: "bad_format" });
  });

  it("тело не объект → bad_format", async () => {
    const result = await ingestRaptWebhook({ rawToken: TOKEN, body: [1, 2, 3], clientIp: null });
    expect(result).toEqual({ kind: "bad_format" });
  });
});

describe("ingestRaptWebhook — автообнаружение устройства и маппинг hardware_kind", () => {
  it("новое устройство создаётся: providerId=rapt-cloud, hardwareId=rapt-<device_id>, name из device_name", async () => {
    const result = await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null });

    expect(result).toEqual({ kind: "stored", created: true });
    expect(store.devices).toHaveLength(1);
    const [device] = store.devices;
    expect(device?.providerId).toBe("rapt-cloud");
    expect(device?.hardwareId).toBe("rapt-AA:BB:CC");
    expect(device?.name).toBe("Pill кухня");
    expect(device?.hardwareKind).toBe("rapt-pill");
    expect(device?.tokenHash).toBeNull();
    expect(device?.tokenEncrypted).toBeNull();
  });

  it("без device_name имя — 'RAPT ' + device_type", async () => {
    await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload({ device_name: "" }), clientIp: null });

    expect(store.devices[0]?.name).toBe("RAPT RAPT Pill");
  });

  it.each([
    ["RAPT Pill", "rapt-pill"],
    ["Fermentation Chamber", "rapt-chamber"],
    ["Temperature Controller", "rapt-chamber"],
    ["Mini Fridge", "rapt-chamber"],
    ["BrewZilla Gen 4", "rapt-brewzilla"],
    ["Неизвестный тип", "other"],
    [null, "other"]
  ])("device_type=%s → hardware_kind=%s", async (deviceType, expectedKind) => {
    await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload({ device_type: deviceType, device_id: `device-${String(deviceType)}` }),
      clientIp: null
    });

    expect(store.devices[0]?.hardwareKind).toBe(expectedKind);
  });

  it("повторный пакет того же device_id НЕ создаёт дубль устройства", async () => {
    const t0 = new Date("2026-07-14T12:00:00Z");
    await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null, receivedAt: t0 });

    const t1 = new Date(t0.getTime() + 6 * 60_000); // после персист-гейта
    await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload({ ts: "2026-07-14T12:06:00.000Z" }),
      clientIp: null,
      receivedAt: t1
    });

    expect(store.devices).toHaveLength(1);
  });
});

describe("ingestRaptWebhook — квота (стрим+RAPT ≤ 10)", () => {
  it("на 11-м устройстве — throttled, новое устройство не создаётся", async () => {
    for (let i = 0; i < 10; i += 1) {
      store.devices.push({ id: `existing-${i}`, userId: USER_ID, providerId: i % 2 === 0 ? "rapt-cloud" : "stream" });
    }

    const result = await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null });

    expect(result).toEqual({ kind: "throttled" });
    expect(store.devices).toHaveLength(10);
  });

  it("устройство, уже существующее ДО достижения квоты, продолжает принимать данные", async () => {
    await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null, receivedAt: new Date("2026-07-14T12:00:00Z") });
    for (let i = 0; i < 9; i += 1) {
      store.devices.push({ id: `filler-${i}`, userId: USER_ID, providerId: "stream" });
    }
    expect(store.devices).toHaveLength(10);

    const result = await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload({ ts: "2026-07-14T12:06:00.000Z" }),
      clientIp: null,
      receivedAt: new Date("2026-07-14T12:06:00Z")
    });

    expect(result).toEqual({ kind: "stored", created: false });
    expect(store.devices).toHaveLength(10);
  });
});

describe("ingestRaptWebhook — строковые числа и нормализация", () => {
  it("значения-строки (@-подстановки RAPT) парсятся в числа и нормализуются", async () => {
    await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null });

    const [row] = store.readings;
    expect(row?.gravitySg).toBeCloseTo(1.048, 5);
    expect(row?.tempC).toBeCloseTo(19.4, 5);
    expect(row?.batteryPct).toBe(87); // >6 → проценты (эвристика normalize-core)
    expect(row?.rssi).toBe(-70);
  });

  it("плаузибилити-клампы: мусорные значения → NULL, но точка пишется с сырым payload", async () => {
    const garbage = raptPayload({ gravity: "999", temperature: "500" });
    const result = await ingestRaptWebhook({ rawToken: TOKEN, body: garbage, clientIp: null });

    expect(result).toEqual({ kind: "stored", created: true });
    const [row] = store.readings;
    expect(row?.gravitySg).toBeNull();
    expect(row?.tempC).toBeNull();
    expect(row?.payload).toEqual(garbage);
  });
});

describe("ingestRaptWebhook — время точки (ts)", () => {
  it("ts вне окна ±48ч → используем receivedAt", async () => {
    const receivedAt = new Date("2026-07-14T12:00:00Z");
    const result = await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload({ ts: "2000-01-01T00:00:00.000Z" }),
      clientIp: null,
      receivedAt
    });

    expect(result).toEqual({ kind: "stored", created: true });
    expect((store.readings[0]?.ts as Date).getTime()).toBe(receivedAt.getTime());
  });

  it("ts в разумном окне → используем sourceTs, а не receivedAt", async () => {
    const receivedAt = new Date("2026-07-14T12:00:00Z");
    const sourceTs = "2026-07-14T11:00:00.000Z"; // час назад — в пределах ±48ч

    await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload({ ts: sourceTs }), clientIp: null, receivedAt });

    expect((store.readings[0]?.ts as Date).toISOString()).toBe(sourceTs);
  });

  it("невалидная строка ts → используем receivedAt (не бросает)", async () => {
    const receivedAt = new Date("2026-07-14T12:00:00Z");
    const result = await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload({ ts: "не дата" }),
      clientIp: null,
      receivedAt
    });

    expect(result).toEqual({ kind: "stored", created: true });
    expect((store.readings[0]?.ts as Date).getTime()).toBe(receivedAt.getTime());
  });
});

describe("ingestRaptWebhook — персист-гейт (§8.5)", () => {
  it("первая точка пишется; вторая через минуту — гейтится", async () => {
    const t0 = new Date("2026-07-14T12:00:00Z");
    const first = await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null, receivedAt: t0 });
    expect(first).toEqual({ kind: "stored", created: true });
    expect(store.readings).toHaveLength(1);

    const t1 = new Date(t0.getTime() + 60_000);
    const second = await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload({ ts: "2026-07-14T12:01:00.000Z" }),
      clientIp: null,
      receivedAt: t1
    });

    expect(second).toEqual({ kind: "throttled" });
    expect(store.readings).toHaveLength(1);
    // Устройство при этом уже создано первым пакетом — throttle не мешает presence:
    expect(store.devices[0]?.lastSeenAt).toEqual(t1);
  });

  it("точка через 5+ минут проходит гейт", async () => {
    const t0 = new Date("2026-07-14T12:00:00Z");
    await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null, receivedAt: t0 });

    const t1 = new Date(t0.getTime() + 5 * 60_000 + 1000);
    const second = await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload({ ts: "2026-07-14T12:05:01.000Z" }),
      clientIp: null,
      receivedAt: t1
    });

    expect(second).toEqual({ kind: "stored", created: false });
    expect(store.readings).toHaveLength(2);
  });
});

describe("ingestRaptWebhook — дедуп (deviceId, ts)", () => {
  // Устройство ПРЕДСОЗДАНО намеренно: гонка автосоздания устройства (два первых
  // пакета одного НОВОГО device_id одновременно) — отдельный edge-case, который
  // в проде закрывает уникальный индекс brew_devices_hardware_id_uidx (см. catch
  // в getOrCreateRaptDevice); in-memory мок insert'ов его не моделирует, поэтому
  // дедуп здесь целится ровно в то, что описано в §8.5 — уникальность показаний
  // (deviceId, ts) на уже существующем устройстве.
  it("два пакета с одинаковым вычисленным ts на существующем устройстве никогда не дают двух строк", async () => {
    store.devices.push({ id: "device-1", userId: USER_ID, providerId: "rapt-cloud", hardwareId: "rapt-AA:BB:CC" });

    const receivedAt = new Date("2026-07-14T12:00:00Z");
    const [a, b] = await Promise.all([
      ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null, receivedAt }),
      ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null, receivedAt })
    ]);

    expect([a.kind, b.kind].every((kind) => kind === "stored" || kind === "throttled")).toBe(true);
    expect(store.readings).toHaveLength(1);
    expect(store.devices).toHaveLength(1);
  });
});

describe("ingestRaptWebhook — денормализация сеанса", () => {
  it("активный сеанс устройства денормализуется в sessionId показания", async () => {
    // receivedAt пинуем: без него берётся реальное «сейчас», и когда оно уходит
    // за ±48ч от захардкоженного ts payload'а (2026-07-14), правило «ts вне окна →
    // receivedAt» переписывает ts первого показания на now, ломая порядок со
    // вторым (фиксированным) пакетом. Пин делает тест независимым от даты прогона.
    const first = await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload(),
      clientIp: null,
      receivedAt: new Date("2026-07-14T12:00:00Z")
    });
    expect(first).toMatchObject({ kind: "stored" });
    const deviceId = store.devices[0]!.id as string;
    store.sessions.push({ id: "session-1", deviceId, endedAt: null });

    await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload({ ts: "2026-07-14T12:10:00.000Z" }),
      clientIp: null,
      receivedAt: new Date("2026-07-14T12:10:00Z")
    });

    expect(store.readings[1]?.sessionId).toBe("session-1");
  });
});

describe("ingestRaptWebhook — вызов processIngestAlerts (F6/M5-A)", () => {
  it("вызывается ПОСЛЕ успешной записи, с sessionId активного сеанса", async () => {
    // receivedAt пинуем: без него берётся реальное «сейчас», и когда оно уходит
    // за ±48ч от захардкоженного ts payload'а (2026-07-14), правило «ts вне окна →
    // receivedAt» переписывает ts первого показания на now, ломая порядок со
    // вторым (фиксированным) пакетом. Пин делает тест независимым от даты прогона.
    const first = await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload(),
      clientIp: null,
      receivedAt: new Date("2026-07-14T12:00:00Z")
    });
    expect(first).toMatchObject({ kind: "stored" });
    const deviceId = store.devices[0]!.id as string;
    store.sessions.push({ id: "session-1", deviceId, endedAt: null });
    const receivedAt = new Date("2026-07-14T12:10:00Z");

    await ingestRaptWebhook({
      rawToken: TOKEN,
      body: raptPayload({ ts: "2026-07-14T12:10:00.000Z" }),
      clientIp: null,
      receivedAt
    });

    expect(mocks.processIngestAlerts).toHaveBeenCalledWith({ deviceId, sessionId: "session-1", receivedAt });
  });

  it("вызывается с sessionId=null, когда активного сеанса нет", async () => {
    await ingestRaptWebhook({ rawToken: TOKEN, body: raptPayload(), clientIp: null });

    expect(mocks.processIngestAlerts).toHaveBeenCalledWith(expect.objectContaining({ sessionId: null }));
  });
});
