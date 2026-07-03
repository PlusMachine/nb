import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { getBrewBatchDetail, getDeviceTelemetryHistory } from "@/features/brew-batches/service";
import { getBrewBatchInventoryView } from "@/features/brew-batches/inventory";
import { brewDayActForStatus, buildBrewDaySteps, summarizeBrewDayPlan } from "@/features/brew-batches/brew-day";
import { resolveBrewNudge } from "@/features/brew-batches/dashboard";
import { resolveBrewCompletionRatingSlug } from "@/features/brew-batches/completion";
import { brewBatchStatusBadgeClass, brewBatchStatusLabels } from "@/features/brew-batches/contracts";
import { getDeviceById } from "@/features/devices/service";
import { deviceChannel } from "@/features/brew-controller";
import { getRecipeById } from "@/features/recipes/service";
import { formatGravity } from "@/features/system/gravity-units";
import { BrewCompletionSummary } from "@/features/brew-batches/components/brew-completion-summary";
import { BrewJournal } from "@/features/brew-batches/components/brew-journal";
import { BrewNotes } from "@/features/brew-batches/components/brew-notes";
import { BrewInventory } from "@/features/brew-batches/components/brew-inventory";
import { LiveDashboard } from "@/features/brew-batches/components/live-dashboard";
import { BatchMenu } from "@/features/brew-batches/components/batch-menu";
import { BrewPrepCard } from "@/features/brew-batches/components/brew-prep-card";
import { BrewDayBoard } from "@/features/brew-batches/components/brew-day-board";
import { FermentationBoard } from "@/features/brew-batches/components/fermentation-board";
import { BrewHistoryGuide } from "@/features/brew-batches/components/brew-history-guide";
import { BrewQuickDock } from "@/features/brew-batches/components/brew-quick-dock";
import { BrewStockNotice } from "@/features/brew-batches/components/brew-stock-notice";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const fmtDate = (value: Date | null) => (value ? dateFmt.format(new Date(value)) : null);

const DAY_MS = 24 * 60 * 60 * 1000;
const readNum = (record: Record<string, unknown> | null, key: string): number | null => {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

// Страница варки — помощник варочного дня. Раскладка ветвится по «акту» (статусу
// партии): подготовка → варочный день → брожение → итог/архив. Каждый акт
// показывает релевантное «сейчас», статус двигают кнопки перехода в актах, а
// ручной путь (правка этапа/отмена) спрятан в меню шапки. Дашборд устройства
// BrewForge — отдельная ветка (device-путь), редизайн актов там отложен.
export default async function BrewBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const detail = await getBrewBatchDetail(user.id, id);
  if (!detail) {
    notFound();
  }

  const { batch, measurements, summary } = detail;
  const hasDevice = Boolean(batch.deviceId);
  const act = brewDayActForStatus(batch.status);
  const device = batch.deviceId ? await getDeviceById(user.id, batch.deviceId) : null;
  const initialHistory = batch.deviceId ? await getDeviceTelemetryHistory(batch.deviceId, batch.id) : [];
  const inventoryView = await getBrewBatchInventoryView(user.id, batch.id);

  // Гид варочного дня строим для варки без устройства во всех актах (в done/archived —
  // read-only история). При устройстве герой — device-дашборд, гид не нужен.
  const brewDaySteps = hasDevice ? [] : buildBrewDaySteps(batch.brewPlanSnapshot);
  const planSummary = summarizeBrewDayPlan(brewDaySteps);

  const target = summary.target;
  const ogTargetLabel = target?.og != null ? formatGravity(target.og, user.preferredGravityUnit) : null;
  const hasOg = measurements.length > 0;

  // Оценка исходного рецепта в итоге варки (см. resolveBrewCompletionRatingSlug):
  // свежий запрос, т.к. рецепт мог уйти в приват/удалиться после варки.
  let ratingTarget: { recipeId: string; slug: string } | null = null;
  if (act === "done" && batch.recipeId) {
    try {
      const sourceRecipe = await getRecipeById(user.id, batch.recipeId);
      const slug = resolveBrewCompletionRatingSlug(batch.status, user.id, {
        authorId: sourceRecipe.authorId,
        publicationState: sourceRecipe.publicationState,
        slug: sourceRecipe.slug
      });
      if (slug) {
        ratingTarget = { recipeId: sourceRecipe.id, slug };
      }
    } catch (error) {
      if (!(error instanceof Error) || (error.message !== "NOT_FOUND" && error.message !== "FORBIDDEN")) {
        throw error;
      }
    }
  }

  // Данные акта брожения: «день N из M», целевая температура, подсказка следующего
  // действия (единый словарь с дашбордом). День считаем от первого замера (OG ≈
  // питчинг) или, если его нет, от старта/создания партии.
  const fermentPlan = batch.brewPlanSnapshot.fermentationPlan;
  const primaryDurationDays = readNum(fermentPlan, "primaryDurationDays");
  const primaryTemperatureC = readNum(fermentPlan, "primaryTemperatureC");
  const fermentStart = measurements[0]?.takenAt ?? batch.startedAt ?? batch.createdAt;
  const fermentDayN = Math.max(1, Math.floor((Date.now() - new Date(fermentStart).getTime()) / DAY_MS) + 1);
  const dayLabel = primaryDurationDays != null
    ? `День ${fermentDayN} из ${Math.round(primaryDurationDays)}`
    : `День ${fermentDayN}`;
  const targetTempLabel = primaryTemperatureC != null ? `${primaryTemperatureC} °C` : null;
  const nudge = act === "fermentation"
    ? resolveBrewNudge(
        {
          status: batch.status,
          plannedFor: batch.plannedFor,
          startedAt: batch.startedAt,
          createdAt: batch.createdAt,
          lastMeasurementAt: measurements.length ? measurements[measurements.length - 1]!.takenAt : null,
          measurementCount: measurements.length
        },
        new Date()
      )
    : null;

  const started = fmtDate(batch.startedAt);
  const completed = fmtDate(batch.completedAt);
  const planned = fmtDate(batch.plannedFor);

  // Атрибуция источника: варка из чужого рецепта без клона — честно указываем автора.
  const recipeSnapshot = batch.recipeSnapshot as { authorId?: string | null; authorName?: string | null } | null;
  const sourceAuthorName = recipeSnapshot?.authorName ?? null;
  const isForeignRecipe = Boolean(recipeSnapshot?.authorId && recipeSnapshot.authorId !== batch.userId);

  return (
    <div className="space-y-6">
      {/* Тост результата списания после диалога «Сварить» (query-параметр stock).
          useSearchParams требует Suspense-границу. */}
      <Suspense fallback={null}>
        <BrewStockNotice />
      </Suspense>

      <div>
        <Link href="/app/brew-batches" className="inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-800">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Все варки
        </Link>
      </div>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-zinc-950">{batch.name}</h1>
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${brewBatchStatusBadgeClass[batch.status]}`}>
              {brewBatchStatusLabels[batch.status]}
            </span>
          </div>
          <p className="text-sm text-zinc-500">
            {batch.brewPlanSnapshot.recipe.title}
            {isForeignRecipe && sourceAuthorName ? <span className="text-zinc-400"> · автор {sourceAuthorName}</span> : null}
            {completed ? ` · завершена ${completed}` : started ? ` · начата ${started}` : planned ? ` · запланирована на ${planned}` : ""}
          </p>
        </div>
        <BatchMenu brewBatchId={batch.id} status={batch.status} />
      </header>

      {hasDevice ? (
        // Device-путь: герой — живой дашборд контроллера. Акты пульта — отдельная фаза.
        <>
          {act === "done" ? (
            <BrewCompletionSummary
              summary={summary}
              preferredGravityUnit={user.preferredGravityUnit}
              batchVolumeL={batch.brewPlanSnapshot.recipe.batchSizeL}
              ratingTarget={ratingTarget}
            />
          ) : null}
          <div className="space-y-6 rounded-2xl border border-zinc-100 bg-white p-4 shadow-sm">
            <h2 className="text-base font-semibold text-zinc-900">Устройство{device?.name ? ` · ${device.name}` : ""}</h2>
            <LiveDashboard
              source={{ kind: "batch", brewBatchId: batch.id }}
              subtitle={device?.name ?? null}
              hasDevice={hasDevice}
              channel={device ? deviceChannel(device) : null}
              initialHistory={initialHistory}
            />
          </div>
          <BrewJournal
            brewBatchId={batch.id}
            measurements={measurements}
            summary={summary}
            preferredGravityUnit={user.preferredGravityUnit}
            hideStats={act === "done"}
          />
          {inventoryView ? <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} /> : null}
          <BrewNotes brewBatchId={batch.id} notes={batch.notes} completed={act === "done"} />
        </>
      ) : act === "prep" ? (
        <>
          <BrewPrepCard brewBatchId={batch.id} planSummary={planSummary} ogTargetLabel={ogTargetLabel} />
          {inventoryView ? <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} /> : null}
          <BrewNotes brewBatchId={batch.id} notes={batch.notes} />
        </>
      ) : act === "brewday" ? (
        <>
          <BrewDayBoard brewBatchId={batch.id} groups={brewDaySteps} initialProgress={batch.brewDayProgress} hasOg={hasOg} />
          <BrewJournal
            brewBatchId={batch.id}
            measurements={measurements}
            summary={summary}
            preferredGravityUnit={user.preferredGravityUnit}
            title="Начальная плотность (OG)"
          />
          {inventoryView ? <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} /> : null}
          <BrewNotes brewBatchId={batch.id} notes={batch.notes} />
          <BrewQuickDock />
        </>
      ) : act === "fermentation" ? (
        <>
          <FermentationBoard
            brewBatchId={batch.id}
            groups={brewDaySteps}
            initialProgress={batch.brewDayProgress}
            dayLabel={dayLabel}
            targetTempLabel={targetTempLabel}
            nudge={nudge}
          />
          <BrewJournal
            brewBatchId={batch.id}
            measurements={measurements}
            summary={summary}
            preferredGravityUnit={user.preferredGravityUnit}
            title="Плотность брожения (FG)"
          />
          {inventoryView ? <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} /> : null}
          <BrewNotes brewBatchId={batch.id} notes={batch.notes} />
          <BrewQuickDock />
        </>
      ) : (
        // done / archived
        <>
          {act === "done" ? (
            <BrewCompletionSummary
              summary={summary}
              preferredGravityUnit={user.preferredGravityUnit}
              batchVolumeL={batch.brewPlanSnapshot.recipe.batchSizeL}
              ratingTarget={ratingTarget}
            />
          ) : (
            <p className="rounded-2xl border border-zinc-100 bg-zinc-50 p-4 text-sm text-zinc-500">
              Варка отменена. Вернуть её в план можно через меню в шапке.
            </p>
          )}
          <BrewHistoryGuide brewBatchId={batch.id} groups={brewDaySteps} initialProgress={batch.brewDayProgress} />
          <BrewJournal
            brewBatchId={batch.id}
            measurements={measurements}
            summary={summary}
            preferredGravityUnit={user.preferredGravityUnit}
            hideStats={act === "done"}
          />
          <BrewNotes brewBatchId={batch.id} notes={batch.notes} completed={act === "done"} />
        </>
      )}
    </div>
  );
}
