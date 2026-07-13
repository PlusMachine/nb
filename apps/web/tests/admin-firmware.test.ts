import { readFile } from "node:fs/promises";

import { beforeEach, describe, expect, it, vi } from "vitest";

// Очередь результатов db.select(): каждая цепочка при await забирает следующий
// элемент. Порядок = порядок вызовов select() в коде (запросы там последовательны).
const { dbState } = vi.hoisted(() => ({
  dbState: { results: [] as unknown[][] }
}));

vi.mock("@nb/db", () => {
  const tableToken = (name: string) =>
    new Proxy({} as Record<string, string>, { get: (_t, prop) => `${name}.${String(prop)}` });

  const makeQuery = () => {
    const chain: Record<string, unknown> = {};
    for (const method of ["from", "leftJoin", "innerJoin", "where", "orderBy", "groupBy", "limit", "offset"]) {
      chain[method] = () => chain;
    }
    chain.then = (resolve: (value: unknown) => void) => resolve(dbState.results.shift() ?? []);
    return chain;
  };

  return {
    db: { select: () => makeQuery() },
    firmwareReleases: tableToken("firmwareReleases"),
    systemEvents: tableToken("systemEvents"),
    users: tableToken("users"),
    and: (...args: unknown[]) => ["and", ...args],
    eq: (column: unknown, value: unknown) => ["eq", column, value],
    desc: (column: unknown) => ["desc", column],
    inArray: (column: unknown, values: unknown[]) => ["inArray", column, values]
  };
});

const publishReleaseMock = vi.fn();
const yankReleaseMock = vi.fn();
vi.mock("../features/firmware/service", () => ({
  publishRelease: (input: unknown) => publishReleaseMock(input),
  yankRelease: (version: string, providerId?: string) => yankReleaseMock(version, providerId)
}));

const recordAuditEventMock = vi.fn();
vi.mock("@/features/audit/service", () => ({
  recordAuditEvent: (input: unknown) => recordAuditEventMock(input)
}));

import { FIRMWARE_UPLOAD_MAX_BYTES } from "../features/firmware/contracts";
import {
  listAdminFirmwareReleases,
  mapFirmwareAdminError,
  publishFirmwareUpload,
  validateFirmwareUpload,
  yankFirmwareRelease
} from "../features/firmware/admin";

const baseUpload = {
  fileName: "brewforge-2.1.0.bin",
  fileSize: 2_000_000,
  version: "2.1.0",
  notes: "Починен OTA",
  channel: "stable" as const,
  protocolSchema: 1
};

const releaseRow = (overrides: Record<string, unknown> = {}) => ({
  id: "r-1",
  providerId: "brewforge",
  version: "2.1.0",
  channel: "stable",
  protocolSchema: 1,
  notes: "Заметки",
  fileName: "brewforge-2.1.0.bin",
  fileSize: 2_000_000,
  fileSha256: "a".repeat(64),
  publishedAt: new Date("2026-07-01T10:00:00Z"),
  yankedAt: null,
  createdAt: new Date("2026-07-01T10:00:00Z"),
  ...overrides
});

beforeEach(() => {
  dbState.results = [];
  publishReleaseMock.mockReset();
  yankReleaseMock.mockReset();
  recordAuditEventMock.mockReset();
});

describe("валидация загрузки прошивки", () => {
  it("принимает корректный образ", () => {
    expect(validateFirmwareUpload(baseUpload)).toEqual({ ok: true });
    expect(validateFirmwareUpload({ ...baseUpload, version: "2.1.0-dev.3" }).ok).toBe(true);
  });

  it("отбивает версию не по semver", () => {
    const result = validateFirmwareUpload({ ...baseUpload, version: "v2.1" });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("semver");
  });

  it("требует версию", () => {
    expect(validateFirmwareUpload({ ...baseUpload, version: "  " }).ok).toBe(false);
  });

  it("отбивает пустой файл", () => {
    const result = validateFirmwareUpload({ ...baseUpload, fileSize: 0 });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("пуст");
  });

  it("отбивает не .bin", () => {
    expect(validateFirmwareUpload({ ...baseUpload, fileName: "firmware.exe" }).ok).toBe(false);
  });

  it("отбивает файл сверх лимита", () => {
    expect(validateFirmwareUpload({ ...baseUpload, fileSize: FIRMWARE_UPLOAD_MAX_BYTES + 1 }).ok).toBe(false);
  });

  it("требует заметки", () => {
    expect(validateFirmwareUpload({ ...baseUpload, notes: "   " }).ok).toBe(false);
  });
});

describe("публикация из веб-формы", () => {
  it("кладёт файл на диск и отдаёт путь в publishRelease, затем пишет в журнал", async () => {
    const bytes = Buffer.from("BREWFORGE-IMAGE");
    let stagedContent: string | null = null;

    publishReleaseMock.mockImplementation(async (input: { filePath: string; version: string }) => {
      // Файл обязан существовать на момент вызова: publishRelease принимает путь, не буфер.
      stagedContent = (await readFile(input.filePath)).toString();
      return { ...releaseRow({ version: input.version }), storagePath: undefined };
    });

    await publishFirmwareUpload({
      ...baseUpload,
      bytes,
      actor: { id: "admin-1", email: "admin@nb.dev" }
    });

    expect(stagedContent).toBe("BREWFORGE-IMAGE");
    expect(publishReleaseMock).toHaveBeenCalledWith(
      expect.objectContaining({ version: "2.1.0", notes: "Починен OTA", channel: "stable", protocolSchema: 1 })
    );

    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "firmware.publish",
        actorUserId: "admin-1",
        actorEmail: "admin@nb.dev",
        entityType: "firmware",
        entityId: "2.1.0"
      })
    );
  });

  it("убирает временный файл, даже если публикация упала (дубль версии)", async () => {
    let stagedPath = "";
    publishReleaseMock.mockImplementation(async (input: { filePath: string }) => {
      stagedPath = input.filePath;
      throw new Error("RELEASE_ALREADY_EXISTS: brewforge 2.1.0 уже публиковался");
    });

    await expect(
      publishFirmwareUpload({ ...baseUpload, bytes: Buffer.from("x"), actor: { id: "a", email: null } })
    ).rejects.toThrow(/RELEASE_ALREADY_EXISTS/);

    await expect(readFile(stagedPath)).rejects.toThrow();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it("дубль версии превращается в человеческий текст", () => {
    const error = new Error("RELEASE_ALREADY_EXISTS: brewforge 2.1.0 уже публиковался");
    expect(mapFirmwareAdminError(error, "2.1.0")).toContain("2.1.0 уже публиковалась");
  });
});

describe("отзыв релиза", () => {
  it("зовёт yankRelease и пишет в журнал с причиной", async () => {
    yankReleaseMock.mockResolvedValue(releaseRow({ yankedAt: new Date() }));

    await yankFirmwareRelease({
      version: "2.1.0",
      reason: "Кирпичит плату при OTA",
      actor: { id: "admin-1", email: "admin@nb.dev" }
    });

    expect(yankReleaseMock).toHaveBeenCalledWith("2.1.0", undefined);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "firmware.yank",
        entityId: "2.1.0",
        payload: expect.objectContaining({ reason: "Кирпичит плату при OTA" })
      })
    );
  });

  it("без причины не отзывает", async () => {
    await expect(
      yankFirmwareRelease({ version: "2.1.0", reason: "   ", actor: { id: "a", email: null } })
    ).rejects.toThrow("YANK_REASON_REQUIRED");
    expect(yankReleaseMock).not.toHaveBeenCalled();
  });

  it("отсутствующий релиз превращается в человеческий текст", () => {
    expect(mapFirmwareAdminError(new Error("RELEASE_NOT_FOUND: brewforge 9.9.9"), "9.9.9")).toContain("не найден");
  });
});

describe("список релизов", () => {
  it("метит актуальным максимальную semver-версию канала, а не последнюю по дате", async () => {
    dbState.results = [
      [
        releaseRow({ id: "r-hotfix", version: "2.0.4", createdAt: new Date("2026-07-05T00:00:00Z") }),
        releaseRow({ id: "r-new", version: "2.1.0", createdAt: new Date("2026-07-01T00:00:00Z") }),
        releaseRow({ id: "r-beta", version: "2.2.0-dev", channel: "beta" })
      ],
      []
    ];

    const releases = await listAdminFirmwareReleases();
    const byId = new Map(releases.map((release) => [release.id, release]));

    expect(byId.get("r-new")?.status).toBe("latest");
    expect(byId.get("r-hotfix")?.status).toBe("published");
    // Канал beta считается отдельно — у него свой актуальный релиз.
    expect(byId.get("r-beta")?.status).toBe("latest");
  });

  it("отозванный релиз не считается актуальным", async () => {
    dbState.results = [
      [
        releaseRow({ id: "r-yanked", version: "2.1.0", yankedAt: new Date("2026-07-02T00:00:00Z") }),
        releaseRow({ id: "r-ok", version: "2.0.0" })
      ],
      []
    ];

    const releases = await listAdminFirmwareReleases();
    const byId = new Map(releases.map((release) => [release.id, release]));

    expect(byId.get("r-yanked")?.status).toBe("yanked");
    expect(byId.get("r-yanked")?.statusLabel).toBe("Отозван");
    expect(byId.get("r-ok")?.status).toBe("latest");
  });

  it("автор публикации подтягивается из журнала, а CLI-релиз остаётся без автора", async () => {
    dbState.results = [
      [releaseRow({ id: "r-web", version: "2.1.0" }), releaseRow({ id: "r-cli", version: "2.0.0" })],
      [
        {
          entityId: "2.1.0",
          actorEmail: "admin@nb.dev",
          actorDisplayName: "Артём",
          actorAnonymizedAt: null,
          createdAt: new Date()
        }
      ]
    ];

    const releases = await listAdminFirmwareReleases();
    const byId = new Map(releases.map((release) => [release.id, release]));

    expect(byId.get("r-web")?.publishedByName).toBe("Артём");
    expect(byId.get("r-cli")?.publishedByName).toBeNull();
  });
});
