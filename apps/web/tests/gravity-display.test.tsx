import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ToastProvider } from "@nb/ui";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BrewPreparationPreview } from "../app/(public)/recipes/[slug]/brew-actions";
import type { BrewMeasurementDto } from "../features/brew-batches/contracts";
import type { PreferredGravityUnit } from "../features/system/gravity-units";

const viewer = vi.hoisted(() => ({
  unit: "plato" as PreferredGravityUnit,
  query: new URLSearchParams()
}));

vi.mock("@/features/system/use-viewer-gravity-unit", () => ({
  useViewerGravityUnit: () => ({ unit: viewer.unit, loaded: true })
}));
vi.mock("@/features/system/gravity-unit-actions", () => ({
  loadViewerPreferredGravityUnit: async () => viewer.unit
}));
vi.mock("@/features/brew-controller/components/ferment-history-chart", () => ({
  FermentHistoryChart: () => null
}));
vi.mock("next/navigation", () => ({ useSearchParams: () => viewer.query }));

import { BrewPreparationSummary } from "../components/recipes/brew-preparation-summary";
import { DemoFermentationSection } from "../components/demo/demo-fermentation";
import { CalculatorPageClient } from "../components/calculators/calculator-page-client";

const preview: BrewPreparationPreview = {
  og: 1.05, fg: 1.012, abv: 5, ibu: 30, color: 5,
  mashWaterL: 15, spargeWaterL: 12, warnings: []
};

const measurement: BrewMeasurementDto = {
  id: "measurement", brewBatchId: "demo", gravitySg: 1.05, isFinal: false, note: null,
  takenAt: new Date("2026-11-01T12:00:00Z"), createdAt: new Date("2026-11-01T12:00:00Z")
};

const text = (html: string) => html.replace(/<[^>]*>/g, "");
const renderCalculator = (slug: "refractometer-correction" | "abv-attenuation" = "refractometer-correction") => renderToStaticMarkup(
  <ToastProvider><CalculatorPageClient slug={slug} /></ToastProvider>
);

beforeEach(() => {
  viewer.unit = "plato";
  viewer.query = new URLSearchParams();
});

describe("основная и дублирующая плотность на экранах варки", () => {
  it.each([
    ["plato", "12.4 °P", "1.050 SG"],
    ["brix", "12.4 °Bx", "1.050 SG"],
    ["sg", "1.050", "12.4 °P"]
  ] as const)("подготовка и масштабирование: %s первым, вторая шкала — дубль", (unit, primary, secondary) => {
    viewer.unit = unit;
    const result = text(renderToStaticMarkup(<BrewPreparationSummary preview={preview} />));
    expect(result).toContain(`НП ${primary} (${secondary})`);
  });

  it("при отсутствии плотности не подставляет пример или дубль", () => {
    const result = text(renderToStaticMarkup(<BrewPreparationSummary preview={{ ...preview, og: null }} />));
    expect(result).toContain("НП —");
    expect(result).not.toMatch(/°P|°Bx|SG/);
  });

  it.each([
    ["plato", "12.4 °P", "1.050 SG"],
    ["brix", "12.4 °Bx", "1.050 SG"],
    ["sg", "1.050", "12.4 °P"]
  ] as const)("демо: %s применяется к сводке и отдельным замерам", (unit, primary, secondary) => {
    viewer.unit = unit;
    const html = renderToStaticMarkup(
      <DemoFermentationSection history={[]} planSteps={[]} measurements={[measurement]}
        dayIndex={1} target={{ og: 1.05, fg: 1.012, abv: 5 }} />
    );
    const summary = text(html.slice(0, html.indexOf("<ul")));
    const readings = text(html.slice(html.indexOf("<ul")));
    expect(summary).toContain(`OG${primary}${secondary}`);
    expect(readings).toContain(`${primary}${secondary}`);
  });
});

describe("шкала результата рефрактометра и калибровки WCF", () => {
  it.each([
    ["Plato", "12.4", "°P", "SG"],
    ["Brix", "12.4", "°Bx", "SG"],
    ["SG", "1.050", "SG", "°P"]
  ] as const)("полная панель сохраняет явно выбранную шкалу %s", (unit, originalValue, primary, secondary) => {
    viewer.query = new URLSearchParams({ originalUnit: unit, originalValue });
    const html = renderCalculator();
    const result = html.slice(html.indexOf('id="calculator-result"'));
    expect(result).toMatch(new RegExp(`text-4xl[^>]*>[^<]+</span><span[^>]*>${primary}</span>`));
    expect(result).toContain(secondary);
  });

  it.each([
    ["plato", "°P"], ["brix", "°P"], ["sg", "SG"]
  ] as const)("WCF использует предпочтение %s и оставляет переключатель", (unit, selected) => {
    viewer.unit = unit;
    const group = renderCalculator().match(/aria-label="Шкала ареометра"[^>]*>(.*?)<\/div>/)?.[1];
    expect(group).toMatch(new RegExp(`aria-pressed="true"[^>]*>${selected}</button>`));
    expect(group).toContain(">°P</button>");
    expect(group).toContain(">SG</button>");
  });
});

describe("подсказки калькулятора крепости", () => {
  it("граница предупреждения об отсутствии экстракта начинается с °P", () => {
    viewer.query = new URLSearchParams({ gravityUnit: "Plato", og: "0", fg: "0" });
    expect(text(renderCalculator("abv-attenuation"))).toContain("выше 0.0 °P (1.000 SG)");
  });

  it.each([
    ["Plato", "20", "17.1 °P (1.070 SG)"],
    ["SG", "1.080", "1.070 SG (17.1 °P)"]
  ] as const)("порог крепкого сусла учитывает шкалу %s", (gravityUnit, og, threshold) => {
    viewer.query = new URLSearchParams({ gravityUnit, og });
    expect(text(renderCalculator("abv-attenuation"))).toContain(`НП выше ${threshold}`);
  });
});
