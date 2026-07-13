import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { KegCarbonationBlock } from "@/components/calculators/keg-carbonation-block";

// Пунктирная метка «ближайшая ячейка» — единственный класс, которым помечается ячейка под
// результат обратного расчёта.
const NEAREST_MARKER = "outline-dashed";

const render = (query?: Record<string, string>) => renderToStaticMarkup(<KegCarbonationBlock initialQuery={query} />);

describe("таблица карбонизации в кеге", () => {
  it("шкала опускается до −2 °C — карбонизация при холодном созревании", () => {
    const html = render();
    expect(html).toContain("-2 °C");
    expect(html).toContain("-1 °C");
    expect(html).toContain("20 °C");
  });

  it("результат внутри сетки помечается ближайшей ячейкой", () => {
    const html = render({ beerTemperatureC: "4", targetCo2Volumes: "2.4" });
    expect(html).toContain(NEAREST_MARKER);
  });

  it("температура ниже шкалы: давление считается, но ячейка не помечается", () => {
    // −5 °C строки в таблице нет. Раньше метка прилипала к краю сетки (0 °C / 0.4 бар) и врала.
    const html = render({ beerTemperatureC: "-5", targetCo2Volumes: "2.4" });
    expect(html).toContain("Температура вне таблицы");
    expect(html).not.toContain(NEAREST_MARKER);
  });

  it("давление выше потолка сетки: ячейка не помечается", () => {
    const html = render({ beerTemperatureC: "20", targetCo2Volumes: "3.0" });
    expect(html).toContain("за пределами таблицы");
    expect(html).not.toContain(NEAREST_MARKER);
  });

  it("давление ниже нижней колонки: ячейка не помечается", () => {
    const html = render({ beerTemperatureC: "0", targetCo2Volumes: "2.0" });
    expect(html).toContain("за пределами таблицы");
    expect(html).not.toContain(NEAREST_MARKER);
  });
});
