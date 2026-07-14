import { describe, expect, it } from "vitest";

import { formatReadingSummary } from "./reading-summary";

describe("formatReadingSummary", () => {
  it("собирает полную строку в SG (пример из ТЗ §5 F1)", () => {
    expect(
      formatReadingSummary({ gravitySg: 1.048, tempC: 19.3, batteryV: 4.1, batteryPct: null }, "sg")
    ).toBe("1.048 · 19.3 °C · батарея 4.1 В");
  });

  it("конвертирует плотность в предпочитаемую единицу пользователя (Plato)", () => {
    const summary = formatReadingSummary({ gravitySg: 1.048, tempC: 19.3, batteryV: null, batteryPct: null }, "plato");
    expect(summary).toContain("°P");
    expect(summary).not.toContain("1.048");
  });

  it("батарея в процентах (RAPT), если вольты не заданы", () => {
    expect(
      formatReadingSummary({ gravitySg: 1.048, tempC: 19.3, batteryV: null, batteryPct: 62.4 }, "sg")
    ).toBe("1.048 · 19.3 °C · батарея 62%");
  });

  it("пропускает поля null (BrewPiLess без плотности)", () => {
    expect(formatReadingSummary({ gravitySg: null, tempC: 19.3, batteryV: null, batteryPct: null }, "sg")).toBe(
      "19.3 °C"
    );
  });

  it("пустая строка, если вообще нет данных", () => {
    expect(formatReadingSummary({ gravitySg: null, tempC: null, batteryV: null, batteryPct: null }, "sg")).toBe("");
  });
});
