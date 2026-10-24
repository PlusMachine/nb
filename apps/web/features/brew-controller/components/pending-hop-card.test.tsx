import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Telemetry } from "@nb/brewforge-protocol";
import { PendingHopCard } from "./pending-hop-card";
import { StatusStrip } from "./status-strip";

const frame = { stageName: "BOILING", nextHopName: "Citra", nextHopG: 40,
  pendingHop: { index: 0, name: "Magnum", amountG: 20, count: 1 },
  outputs: [{ role: "heater1", label: "Основной ТЭН", on: true }],
  heatDutyPct: 85 } as Telemetry;

describe("рабочие карточки BrewForge", () => {
  it("рисует текущее внесение и блокирует подтверждение при потере связи", () => {
    const html = renderToStaticMarkup(<PendingHopCard telemetry={frame} disabled onAck={() => {}} />);
    expect(html).toContain("Magnum");
    expect(html).not.toContain("Citra");
    expect(html).toContain('disabled=""');
    expect(html).toContain("Внесено");
  });
  it("рисует последнее внесение без будущего хмеля", () => {
    expect(renderToStaticMarkup(<PendingHopCard telemetry={{ ...frame, nextHopName: "" }} disabled={false} onAck={() => {}} />)).toContain("Magnum");
  });
  it("показывает только выходы из конфигурации новой прошивки", () => {
    const html = renderToStaticMarkup(<StatusStrip telemetry={frame} />);
    expect(html).toContain("Основной ТЭН");
    expect(html).not.toContain("Насос 2");
    expect(html).not.toContain("Нагрев промывки");
  });
  it("сохраняет отображение старых прошивок без outputs", () => {
    expect(renderToStaticMarkup(<StatusStrip telemetry={{ ...frame, outputs: undefined }} />)).toContain("Нагрев (SSR)");
  });
});
