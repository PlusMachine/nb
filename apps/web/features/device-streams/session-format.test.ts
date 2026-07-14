import { describe, expect, it } from "vitest";

import { formatSessionPeriod, formatSessionSince } from "./session-format";

// =============================================================================
//  Юнит-тесты session-format — строки сеансов (§5 F2/F3, M2-C). Без БД.
// =============================================================================

describe("formatSessionSince", () => {
  it("форматирует начало сеанса как «с <дата>, <время>»", () => {
    expect(formatSessionSince(new Date("2026-07-14T08:12:00"))).toBe("с 14 июл., 08:12");
  });
});

describe("formatSessionPeriod", () => {
  it("активный сеанс (endedAt=null) → «<дата начала> – сейчас»", () => {
    expect(formatSessionPeriod(new Date("2026-07-14T08:12:00"), null)).toBe("14 июл. – сейчас");
  });

  it("сеанс в один календарный день → одна дата + диапазон времени", () => {
    expect(
      formatSessionPeriod(new Date("2026-07-14T08:12:00"), new Date("2026-07-14T19:40:00"))
    ).toBe("14 июл., 08:12–19:40");
  });

  it("сеанс на несколько дней → диапазон дат без времени", () => {
    expect(
      formatSessionPeriod(new Date("2026-07-14T08:12:00"), new Date("2026-07-20T10:00:00"))
    ).toBe("14 июл. – 20 июл.");
  });
});
