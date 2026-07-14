// =============================================================================
//  features/device-streams/components/batch-ferment-block.tsx
//  Блок «Брожение» на странице партии (§5 F3, M2-C): сводка + график + сеансы.
//  Серверная сборка (readBatchFermentSeries → сводка/сессии/ручные замеры уже
//  посчитаны), интерактив (завершить сеанс, подключить ареометр) — клиентские
//  подкомпоненты (batch-ferment-controls.tsx), график — клиентский FermentChart.
//
//  Два режима:
//  - variant="active" (акт «Брожение»): всегда рендерится, даже без единой
//    точки/замера (П1 — «Подключить ареометр»/«Добавить замер» первичны, график
//    сам показывает компактную заглушку «Замеров пока нет.»);
//  - variant="history" (акт «Итог», done): рендерится, только если у партии
//    БЫЛИ сеансы устройства ИЛИ ≥2 ручных замера (иначе один замер и так виден
//    плитками BrewCompletionSummary/BrewJournal — вторая копия графика не нужна);
//    без управляющих элементов, диапазон сразу «Всё» — это история, не пульт.
// =============================================================================
import type { PreferredGravityUnit } from "@nb/auth";

import { formatGravity } from "@/features/system/gravity-units";
import type { BrewBatchStatus } from "@/features/brew-batches/contracts";

import { readBatchFermentSeries, type BatchFermentSummary } from "../series";
import { listAvailableStreamDevices } from "../sessions";
import { ActiveSessionRow, AttachDeviceControl } from "./batch-ferment-controls";
import { FermentChart, type FermentChartSession } from "./ferment-chart";

const MIN_HISTORY_MANUAL_MEASUREMENTS = 2;

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function FermentSummaryRow({ summary, gravityUnit }: { summary: BatchFermentSummary; gravityUnit: PreferredGravityUnit }) {
  const gravityText = summary.currentGravitySg != null ? formatGravity(summary.currentGravitySg, gravityUnit) : "—";
  const attText = summary.visibleAttenuationPct != null ? `${Math.round(summary.visibleAttenuationPct)}%` : "—";
  const abvText = summary.abvEstimate != null ? `~${summary.abvEstimate.toFixed(1)}%` : "—";
  const tempText = summary.tempC != null ? `${summary.tempC.toFixed(1)} °C` : "—";

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <SummaryTile label="Плотность сейчас" value={gravityText} />
      <SummaryTile label="Сбраживание" value={attText} />
      <SummaryTile label="ABV, оценка" value={abvText} />
      <SummaryTile label="Температура" value={tempText} />
    </div>
  );
}

export async function BatchFermentBlock({
  userId,
  brewBatchId,
  batchStatus,
  gravityUnit,
  variant
}: {
  userId: string;
  brewBatchId: string;
  batchStatus: BrewBatchStatus;
  gravityUnit: PreferredGravityUnit;
  variant: "active" | "history";
}) {
  const { sessions, manualMeasurements, summary } = await readBatchFermentSeries(userId, brewBatchId);
  const hasAnyData = sessions.some((s) => s.points.length > 0) || manualMeasurements.length > 0;

  if (variant === "history" && !(sessions.length > 0 || manualMeasurements.length >= MIN_HISTORY_MANUAL_MEASUREMENTS)) {
    return null;
  }

  const chartSessions: FermentChartSession[] = sessions.map((s) => ({
    id: s.session.id,
    deviceName: s.session.deviceName,
    startedAt: s.session.startedAt.getTime(),
    endedAt: s.session.endedAt ? s.session.endedAt.getTime() : null,
    points: s.points,
    intervalSeconds: s.intervalSeconds
  }));

  const activeSessions = variant === "active" ? sessions.filter((s) => s.session.endedAt === null) : [];

  const availableDevices =
    variant === "active" && (batchStatus === "fermenting" || batchStatus === "brewing")
      ? await listAvailableStreamDevices(userId)
      : [];

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Брожение</h2>

      {hasAnyData ? <FermentSummaryRow summary={summary} gravityUnit={gravityUnit} /> : null}

      <FermentChart
        sessions={chartSessions}
        manualMeasurements={manualMeasurements}
        gravityUnit={gravityUnit}
        defaultRange={variant === "history" ? "all" : "7d"}
      />

      {variant === "active" && (activeSessions.length > 0 || availableDevices.length > 0) ? (
        <div className="space-y-2 border-t border-border pt-3">
          {activeSessions.map((s) => (
            <ActiveSessionRow
              key={s.session.id}
              session={{
                id: s.session.id,
                deviceName: s.session.deviceName,
                deviceHardwareKind: s.session.hardwareKind,
                startedAt: s.session.startedAt.getTime(),
                readingsCount: s.points.length
              }}
            />
          ))}
          <AttachDeviceControl brewBatchId={brewBatchId} devices={availableDevices} />
        </div>
      ) : null}
    </section>
  );
}
