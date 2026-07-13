import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Журнал — клиентский компонент поверх server actions: мокаем экшены, иначе
// импорт утянет db-слой. (Файл .ts, поэтому рендерим через createElement.)
vi.mock("@/app/(app)/app/brew-batches/[id]/actions", () => ({
  addBrewMeasurementAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  deleteBrewMeasurementAction: vi.fn(async () => ({ ok: true, message: "ok" })),
  setBrewMeasurementFinalAction: vi.fn(async () => ({ ok: true, message: "ok" }))
}));

import { summarizeBrewMeasurements } from "../features/brew-batches/measurements";
import { brewMeasurementKindForAct, resolveBrewGravityPlaceholderSg } from "../features/brew-batches/brew-day";
import { BrewJournal } from "../features/brew-batches/components/brew-journal";
import type { BrewMeasurementDto, BrewMeasurementSummary } from "../features/brew-batches/contracts";

const reading = (
  gravitySg: number,
  takenAtIso: string,
  { isFinal = false, id = takenAtIso }: { isFinal?: boolean; id?: string } = {}
): BrewMeasurementDto => ({
  id,
  brewBatchId: "b-1",
  gravitySg,
  takenAt: new Date(takenAtIso),
  isFinal,
  note: null,
  createdAt: new Date(takenAtIso)
});

const targets = { og: 1.052, fg: 1.012, abv: 5.2 };

describe("summarizeBrewMeasurements", () => {
  it("returns nulls and passes through targets when there are no readings", () => {
    const summary = summarizeBrewMeasurements([], targets);
    expect(summary.og).toBeNull();
    expect(summary.fg).toBeNull();
    expect(summary.abv).toBeNull();
    expect(summary.apparentAttenuation).toBeNull();
    expect(summary.target).toEqual(targets);
  });

  it("with a single non-final reading sets OG but leaves FG/ABV null", () => {
    const summary = summarizeBrewMeasurements([reading(1.05, "2026-06-01T10:00:00Z")], targets);
    expect(summary.og).toBe(1.05);
    expect(summary.fg).toBeNull();
    expect(summary.abv).toBeNull();
    expect(summary.apparentAttenuation).toBeNull();
  });

  it("intermediate readings never become FG until one is flagged isFinal", () => {
    const during = summarizeBrewMeasurements([
      reading(1.05, "2026-06-01T10:00:00Z"),
      reading(1.02, "2026-06-05T10:00:00Z"),
      reading(1.014, "2026-06-08T10:00:00Z")
    ], targets);
    // Ни один замер не помечен финальным → FG/ABV не выводятся, хотя замеров ≥2.
    expect(during.og).toBe(1.05);
    expect(during.fg).toBeNull();
    expect(during.abv).toBeNull();
    expect(during.apparentAttenuation).toBeNull();
  });

  it("FG comes from the isFinal flag, not from order/time", () => {
    // Финальным помечен ранний по времени замер, а не самый поздний.
    const summary = summarizeBrewMeasurements([
      reading(1.012, "2026-06-06T10:00:00Z", { isFinal: true }),
      reading(1.055, "2026-06-01T10:00:00Z"),
      reading(1.02, "2026-06-12T10:00:00Z")
    ], null);
    expect(summary.og).toBe(1.055); // самый ранний по takenAt
    expect(summary.fg).toBe(1.012); // помеченный isFinal, хотя он не последний
    expect(summary.target).toBeNull();
  });

  it("derives OG=earliest, FG=flagged reading and computes ABV + apparent attenuation", () => {
    const summary = summarizeBrewMeasurements([
      reading(1.05, "2026-06-01T10:00:00Z"),
      reading(1.01, "2026-06-10T10:00:00Z", { isFinal: true })
    ], targets);
    expect(summary.og).toBe(1.05);
    expect(summary.fg).toBe(1.01);
    expect(summary.abv).toBeCloseTo(5.25, 2); // (1.05-1.01)*131.25
    expect(summary.apparentAttenuation).toBeCloseTo(80, 1); // (0.04/0.05)*100
  });

  it("guards nonsensical data (fg >= og) → no ABV/attenuation", () => {
    const summary = summarizeBrewMeasurements([
      reading(1.01, "2026-06-01T10:00:00Z"),
      reading(1.05, "2026-06-10T10:00:00Z", { isFinal: true })
    ], targets);
    expect(summary.og).toBe(1.01);
    expect(summary.fg).toBe(1.05);
    expect(summary.abv).toBeNull();
    expect(summary.apparentAttenuation).toBeNull();
  });
});

// --- Подсказка в поле плотности (A6) ------------------------------------------
// Плейсхолдер журнала был жёстко зашит как 1.012 SG (= 3.1 °P — типичная FG) во
// всех четырёх контекстах, включая блок «Начальная плотность (OG)».

describe("brewMeasurementKindForAct", () => {
  it("варочный день ждёт OG, брожение — FG", () => {
    expect(brewMeasurementKindForAct("brewday")).toBe("og");
    expect(brewMeasurementKindForAct("fermentation")).toBe("fg");
  });

  it("в подготовке, итоге и архиве замер не подсказывается", () => {
    expect(brewMeasurementKindForAct("prep")).toBe("any");
    expect(brewMeasurementKindForAct("done")).toBe("any");
    expect(brewMeasurementKindForAct("archived")).toBe("any");
  });
});

describe("resolveBrewGravityPlaceholderSg", () => {
  it("подсказывает цель рецепта по контексту", () => {
    expect(resolveBrewGravityPlaceholderSg("og", targets)).toBe(1.052);
    expect(resolveBrewGravityPlaceholderSg("fg", targets)).toBe(1.012);
  });

  it("без целей (варка без рецепта) — типичные значения, а не FG в поле OG", () => {
    expect(resolveBrewGravityPlaceholderSg("og", null)).toBe(1.05);
    expect(resolveBrewGravityPlaceholderSg("fg", null)).toBe(1.012);
    expect(resolveBrewGravityPlaceholderSg("og", { og: null, fg: 1.012, abv: null })).toBe(1.05);
  });

  it("вне варочного дня и брожения подсказки нет", () => {
    expect(resolveBrewGravityPlaceholderSg("any", targets)).toBeNull();
  });
});

describe("BrewJournal — плейсхолдер плотности", () => {
  const summary: BrewMeasurementSummary = {
    og: null,
    fg: null,
    abv: null,
    apparentAttenuation: null,
    target: { og: 1.052, fg: 1.012, abv: 5.2 }
  };

  const render = (measurementKind: "og" | "fg" | "any", preferredGravityUnit: "sg" | "plato" = "plato") =>
    renderToStaticMarkup(
      React.createElement(BrewJournal, {
        brewBatchId: "bb-1",
        measurements: [],
        summary,
        preferredGravityUnit,
        measurementKind
      })
    );

  it("в блоке OG подсказывает целевую OG (а не типичную FG)", () => {
    const html = render("og");
    expect(html).toContain('placeholder="12.9"');
    expect(html).not.toContain('placeholder="3.1"');
  });

  it("в блоке FG подсказывает целевую FG", () => {
    expect(render("fg")).toContain('placeholder="3.1"');
  });

  it("в итоге/архиве/на устройстве подсказки плотности нет", () => {
    const html = render("any");
    // Поле плотности рендерится без атрибута placeholder (у соседнего поля
    // «Заметка» свой плейсхолдер — его не трогаем).
    expect(html).toMatch(/aria-label="Плотность[^>]*\/>/);
    expect(html).not.toContain('placeholder="12.9"');
    expect(html).not.toContain('placeholder="3.1"');
  });

  it("подсказка идёт в единице пользователя", () => {
    expect(render("og", "sg")).toContain('placeholder="1.052"');
  });
});
