import { describe, expect, it } from "vitest";

import {
  compareFirmwareVersions,
  isNewerFirmwareVersion,
  isValidFirmwareVersion,
  pickLatestRelease,
} from "./versions";

// =============================================================================
//  Юнит-тесты semver-компаратора фичи firmware (F2). Колокированный тест без БД
//  (модуль versions.ts намеренно не импортирует @nb/db — паттерн tile-snapshot).
//  Глубокая матрица сравнений — в packages/brewforge-protocol/src/update.test.ts
//  (каноническая реализация); здесь — публичное API фичи.
// =============================================================================

describe("compareFirmwareVersions / isNewerFirmwareVersion", () => {
  it("упорядочивает по числовым компонентам", () => {
    expect(compareFirmwareVersions("2.1.0", "2.0.9")).toBeGreaterThan(0);
    expect(compareFirmwareVersions("2.1.2", "2.1.10")).toBeLessThan(0);
    expect(compareFirmwareVersions("2.1.0", "2.1.0")).toBe(0);
  });

  it("prerelease младше релиза той же тройки: 2.1.0-dev < 2.1.0", () => {
    expect(compareFirmwareVersions("2.1.0-dev", "2.1.0")).toBeLessThan(0);
    expect(isNewerFirmwareVersion("2.1.0", "2.1.0-dev")).toBe(true);
    expect(isNewerFirmwareVersion("2.1.0-dev", "2.0.9")).toBe(true);
  });

  it("prerelease сравниваются между собой (semver §11)", () => {
    expect(compareFirmwareVersions("2.1.0-beta.2", "2.1.0-beta.11")).toBeLessThan(0);
    expect(compareFirmwareVersions("2.1.0-alpha", "2.1.0-beta")).toBeLessThan(0);
  });
});

describe("isValidFirmwareVersion", () => {
  it.each(["2.1.0", "0.0.1", "2.1.0-dev", "2.1.0-beta.3"])("принимает %s", (v) => {
    expect(isValidFirmwareVersion(v)).toBe(true);
  });

  it.each(["", "2.1", "v2.1.0", "dev-build", "2.1.0-"])("отклоняет %j", (v) => {
    expect(isValidFirmwareVersion(v)).toBe(false);
  });
});

describe("pickLatestRelease — выбор релиза с максимальной версией", () => {
  it("выбирает по semver, а не по порядку/дате", () => {
    const rows = [{ version: "2.1.0" }, { version: "2.0.4" }, { version: "1.9.9" }];
    expect(pickLatestRelease(rows)?.version).toBe("2.1.0");
  });

  it("релиз перекрывает prerelease той же тройки", () => {
    expect(pickLatestRelease([{ version: "2.1.0-dev" }, { version: "2.1.0" }])?.version).toBe("2.1.0");
  });

  it("игнорирует не-semver строки; пустой список → null", () => {
    expect(pickLatestRelease([{ version: "мусор" }, { version: "1.0.0" }])?.version).toBe("1.0.0");
    expect(pickLatestRelease([])).toBeNull();
    expect(pickLatestRelease([{ version: "мусор" }])).toBeNull();
  });
});
