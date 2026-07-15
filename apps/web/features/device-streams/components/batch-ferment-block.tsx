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
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import type { PreferredGravityUnit } from "@nb/auth";

import { formatGravity } from "@/features/system/gravity-units";
import type { BrewBatchStatus } from "@/features/brew-batches/contracts";
import { buildCalculatorHref } from "@/features/calculators/catalog";
import { pluralize } from "@/lib/pluralize";

import { previewGravityFromCurve } from "../corrections";
import { readBatchFermentSeries, type BatchFermentSummary } from "../series";
import { listAvailableStreamDevices, listSessionsForBatch } from "../sessions";
import type { FermentVerdict } from "../verdict-core";
import { ActiveSessionRow, AttachDeviceControl } from "./batch-ferment-controls";
import { FermentRangePanel } from "./ferment-range-panel";
import type { FermentChartSession } from "./ferment-chart";
import { GravityConfirmRow } from "./gravity-confirm-row";
import { SessionCalibrationControl } from "./session-calibration-control";

const MIN_HISTORY_MANUAL_MEASUREMENTS = 2;

// Лейблы вердикта (§5 F5) — insufficient_data сюда не попадает (строка вердикта тогда не
// рендерится вовсе, см. FermentVerdictRow).
const VERDICT_LABELS: Record<Exclude<FermentVerdict["kind"], "insufficient_data">, string> = {
  batch_completed: "Брожение завершено",
  fg_confirmed: "Добродило — FG зафиксирован",
  awaiting_start: "Ждём начала брожения",
  not_started: "Брожение не началось?",
  active: "Бродит активно",
  slowing: "Дображивает",
  possibly_stuck: "Возможен затык",
  likely_done: "Похоже, добродило"
};

// ⚠-вердикты (§5 F5) — тревожный тон/иконка, остальные — нейтральный.
const WARNING_VERDICT_KINDS = new Set<FermentVerdict["kind"]>(["not_started", "possibly_stuck"]);

/**
 * Строка вердикта в сводке блока «Брожение» (§5 F5). insufficient_data — вообще не
 * рендерим (нечего сказать, П1: не кричащий блок). На отменённой партии (cancelled) —
 * тоже не рендерим (Ф3б, решение владельца): вердикт брожения теряет смысл, если варка
 * отменена. У likely_done — обязательная (П5) приписка «Перед розливом подтвердите
 * плотность ареометром» + ссылка на калькулятор прайминга с предзаполненной температурой
 * (FG калькулятор не принимает — ни у priming-sugar, ни у keg-carbonation нет такого поля
 * во входных данных).
 */
function FermentVerdictRow({
  verdict,
  tempC,
  batchStatus
}: {
  verdict: FermentVerdict | null;
  tempC: number | null;
  batchStatus: BrewBatchStatus;
}) {
  if (verdict === null || verdict.kind === "insufficient_data" || batchStatus === "cancelled") {
    return null;
  }

  const isWarning = WARNING_VERDICT_KINDS.has(verdict.kind);

  return (
    <div
      className={`space-y-1.5 rounded-lg px-3 py-2 text-sm ${
        isWarning ? "bg-warning-subtle text-warning-subtle-foreground" : "bg-muted text-foreground"
      }`}
    >
      <p className="flex items-center gap-2 font-medium">
        {isWarning ? <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> : null}
        {VERDICT_LABELS[verdict.kind]}
      </p>
      {verdict.kind === "likely_done" ? (
        <p className="text-xs leading-5 text-muted-foreground">
          Стабильно {verdict.stableDays} {pluralize(verdict.stableDays, ["день", "дня", "дней"])}. Перед розливом
          подтвердите плотность ареометром.{" "}
          <Link
            href={buildCalculatorHref("priming-sugar", { beerTemperatureC: tempC != null ? Number(tempC.toFixed(1)) : undefined })}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Перейти к розливу
          </Link>
        </p>
      ) : null}
    </div>
  );
}

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
  // includeExcluded:true всегда (M3-C, F3 «показать исключённые») — тумблер в
  // FermentChart/FermentRangePanel решает клиентски, показывать ли их точками;
  // сама кривая/сглаживание/сводка/вердикт excluded и так игнорируют (series.ts).
  const { sessions, manualMeasurements, summary } = await readBatchFermentSeries(userId, brewBatchId, {
    includeExcluded: true
  });
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

  // §5 F6 (M5-A): коридор алертов/alertsMuted не входят в FermentSessionSeries.session
  // (series.ts — чужой файл, читаем его как есть) — довыбираем полные DTO сеансов
  // партии (sessions.ts, свой файл) и мержим по id только для активных строк.
  const alertSettingsBySessionId =
    variant === "active" && activeSessions.length > 0
      ? new Map(
          (await listSessionsForBatch(userId, brewBatchId)).map((dto) => [
            dto.id,
            { tempMinC: dto.tempMinC, tempMaxC: dto.tempMaxC, alertsMuted: dto.alertsMuted }
          ])
        )
      : new Map<string, { tempMinC: number | null; tempMaxC: number | null; alertsMuted: boolean }>();

  const availableDevices =
    variant === "active" && (batchStatus === "fermenting" || batchStatus === "brewing")
      ? await listAvailableStreamDevices(userId)
      : [];

  // F4.4 (M3-C): «Записать OG/FG N с ареометра?» — предпросмотр на сеансе, выбранном
  // тем же правилом, что и вердикт (verdictSessionId), чтобы предложение совпадало с
  // тем, что человек видит в сводке. Только для активного блока — история read-only.
  let ogSuggestion: number | null = null;
  let fgSuggestion: number | null = null;
  const suggestionSessionId = summary.verdictSessionId;
  if (variant === "active" && suggestionSessionId) {
    if (summary.og === null) {
      ogSuggestion = await previewGravityFromCurve(userId, { sessionId: suggestionSessionId, kind: "og" });
    }
    if (summary.verdict?.kind === "likely_done" && summary.fg === null) {
      fgSuggestion = await previewGravityFromCurve(userId, { sessionId: suggestionSessionId, kind: "fg" });
    }
  }

  // F4.1 (M3-C): «Выровнять по моему замеру» — нужен хотя бы один активный сеанс И
  // хотя бы один ручной замер (офсет считается по интерполяции кривой на момент замера).
  const calibrationSessions = activeSessions.map((s) => ({
    id: s.session.id,
    deviceName: s.session.deviceName,
    calibrationOffsetSg: s.session.calibrationOffsetSg
  }));
  const calibrationMeasurements = manualMeasurements.map((m) => ({ ts: m.ts, gravitySg: m.gravitySg }));

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <h2 className="text-base font-semibold text-foreground">Брожение</h2>

      {hasAnyData ? <FermentSummaryRow summary={summary} gravityUnit={gravityUnit} /> : null}

      <FermentVerdictRow verdict={summary.verdict} tempC={summary.tempC} batchStatus={batchStatus} />

      {variant === "active" ? (
        <SessionCalibrationControl sessions={calibrationSessions} measurements={calibrationMeasurements} gravityUnit={gravityUnit} />
      ) : null}

      {ogSuggestion !== null && suggestionSessionId ? (
        <GravityConfirmRow sessionId={suggestionSessionId} kind="og" gravitySg={ogSuggestion} gravityUnit={gravityUnit} />
      ) : null}
      {fgSuggestion !== null && suggestionSessionId ? (
        <GravityConfirmRow sessionId={suggestionSessionId} kind="fg" gravitySg={fgSuggestion} gravityUnit={gravityUnit} />
      ) : null}

      <FermentRangePanel
        sessions={chartSessions}
        manualMeasurements={manualMeasurements}
        gravityUnit={gravityUnit}
        defaultRange={variant === "history" ? "all" : "7d"}
        interactive={variant === "active"}
      />

      {variant === "active" && (activeSessions.length > 0 || availableDevices.length > 0) ? (
        <div className="space-y-2 border-t border-border pt-3">
          {activeSessions.map((s) => {
            const alertSettings = alertSettingsBySessionId.get(s.session.id);
            return (
              <ActiveSessionRow
                key={s.session.id}
                session={{
                  id: s.session.id,
                  deviceName: s.session.deviceName,
                  deviceHardwareKind: s.session.hardwareKind,
                  startedAt: s.session.startedAt.getTime(),
                  // includeExcluded:true (см. выше) — считаем видимые точки, не все подряд,
                  // «N точек» в строке сеанса не должно вдруг вырасти на число исключённых.
                  readingsCount: s.points.filter((p) => !p.excluded).length,
                  tempMinC: alertSettings?.tempMinC ?? null,
                  tempMaxC: alertSettings?.tempMaxC ?? null,
                  alertsMuted: alertSettings?.alertsMuted ?? false
                }}
              />
            );
          })}
          <AttachDeviceControl brewBatchId={brewBatchId} devices={availableDevices} />
        </div>
      ) : null}
    </section>
  );
}
