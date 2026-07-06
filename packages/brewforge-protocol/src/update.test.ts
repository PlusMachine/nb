import { describe, expect, it } from "vitest";

import {
  FirmwareUpdateMessageSchema,
  compareFirmwareVersions,
  decideFirmwareUpdate,
  parseFirmwareVersion,
} from "./update";
import { topics } from "./topics";

// =============================================================================
//  Юнит-тесты OTA-обновлений (F3, docs/brewforge-firmware-releases.md):
//  схема retained-сообщения .../update, semver-компаратор (prerelease < release)
//  и чистое решение моста decideFirmwareUpdate.
// =============================================================================

const validUpdate = {
  schema: 1,
  version: "2.1.0",
  url: "https://nb.example/api/firmware/download/2.1.0",
  sha256: "ab".repeat(32),
  size: 1234567,
  protocolSchema: 1,
  notes: "Что нового…",
};

describe("FirmwareUpdateMessageSchema — retained brewforge/<id>/update (§5.3)", () => {
  it("парсит валидный payload по контракту", () => {
    const parsed = FirmwareUpdateMessageSchema.parse(validUpdate);
    expect(parsed.version).toBe("2.1.0");
    expect(parsed.size).toBe(1234567);
  });

  it.each([
    ["schema != 1", { ...validUpdate, schema: 2 }],
    ["url не URL", { ...validUpdate, url: "не-урл" }],
    ["size не положительный", { ...validUpdate, size: 0 }],
    ["без sha256", (({ sha256: _sha, ...rest }) => rest)(validUpdate)],
  ])("отклоняет payload: %s", (_label, payload) => {
    expect(FirmwareUpdateMessageSchema.safeParse(payload).success).toBe(false);
  });

  it("топик update входит в карту топиков устройства", () => {
    expect(topics("bf-0001").update).toBe("brewforge/bf-0001/update");
  });
});

describe("parseFirmwareVersion", () => {
  it("разбирает релиз и prerelease", () => {
    expect(parseFirmwareVersion("2.1.0")).toEqual({ major: 2, minor: 1, patch: 0, prerelease: [] });
    expect(parseFirmwareVersion("2.1.0-dev.3")).toEqual({
      major: 2,
      minor: 1,
      patch: 0,
      prerelease: ["dev", "3"],
    });
  });

  it.each(["", "2.1", "v2.1.0", "2.1.0.4", "abc", "2.1.0-"])(
    "возвращает null для не-semver %j",
    (raw) => {
      expect(parseFirmwareVersion(raw)).toBeNull();
    },
  );
});

describe("compareFirmwareVersions — semver с prerelease", () => {
  it.each([
    ["1.0.0", "2.0.0", -1],
    ["2.1.0", "2.1.0", 0],
    ["2.2.0", "2.1.9", 1],
    ["2.1.9", "2.1.10", -1], // числовое сравнение, не лексикографическое
    ["2.1.0-dev", "2.1.0", -1], // prerelease < release той же тройки
    ["2.1.0", "2.1.0-beta", 1],
    ["2.1.0-alpha", "2.1.0-beta", -1],
    ["2.1.0-beta.2", "2.1.0-beta.11", -1], // числовые идентификаторы — численно
    ["2.1.0-beta", "2.1.0-beta.1", -1], // короче < длиннее
    ["2.1.0-1", "2.1.0-alpha", -1], // числовые < буквенных
  ] as const)("cmp(%s, %s) → знак %i", (a, b, sign) => {
    expect(Math.sign(compareFirmwareVersions(a, b))).toBe(sign);
    // `|| 0` — нормализация -0 (Object.is в toBe различает 0 и -0).
    expect(Math.sign(compareFirmwareVersions(b, a))).toBe(-sign || 0);
  });

  it("бросает на не-semver входе", () => {
    expect(() => compareFirmwareVersions("мусор", "2.1.0")).toThrow();
  });
});

describe("decideFirmwareUpdate — решение моста", () => {
  it("offer: у устройства версия старее релиза", () => {
    expect(decideFirmwareUpdate("2.0.3", "2.1.0")).toBe("offer");
    expect(decideFirmwareUpdate("2.1.0-dev", "2.1.0")).toBe("offer");
  });

  it("clear: устройство догнало или обогнало релиз", () => {
    expect(decideFirmwareUpdate("2.1.0", "2.1.0")).toBe("clear");
    expect(decideFirmwareUpdate("2.2.0-dev", "2.1.0")).toBe("clear");
  });

  it("none: fw неизвестен, релизов нет или версии не semver", () => {
    expect(decideFirmwareUpdate(null, "2.1.0")).toBe("none");
    expect(decideFirmwareUpdate("2.1.0", null)).toBe("none");
    expect(decideFirmwareUpdate("", "2.1.0")).toBe("none");
    expect(decideFirmwareUpdate("dev-build", "2.1.0")).toBe("none");
  });
});
