import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { getBrewBatchDetail, getDeviceTelemetryHistory } from "@/features/brew-batches/service";
import { getBrewBatchInventoryView } from "@/features/brew-batches/inventory";
import {
  brewDayActForStatus,
  brewMeasurementKindForAct,
  buildBrewDaySteps,
  summarizeBrewDayPlan
} from "@/features/brew-batches/brew-day";
import { resolveBrewNudge } from "@/features/brew-batches/dashboard";
import { resolveBrewCompletionRatingSlug } from "@/features/brew-batches/completion";
import {
  brewBatchStatusBadgeClass,
  brewBatchStatusLabels,
  FERMENT_HISTORY_LIMIT,
  FERMENT_HISTORY_WINDOW_DAYS,
  type BrewRecipeSnapshot
} from "@/features/brew-batches/contracts";
import { getDeviceById } from "@/features/devices/service";
import { listFermenterCandidates } from "@/features/devices/fermenter-binding";
import { deviceChannel } from "@/features/brew-controller";
import { mapFermentationPlanToDeviceSteps } from "@/features/brew-controller/ferment-profile";
import { getRecipeById } from "@/features/recipes/service";
import { computeRecipeMatch } from "@/features/recipes/match-service";
import { isShoppingGapLine } from "@/features/shopping/service";
import { formatGravity, formatGravityNumber, resolvePreferredGravityUnit } from "@/features/system/gravity-units";
import { formatRelativeTimestamp } from "@/features/recipes/format";
import { resolveFermenterBindingStatus } from "@/features/brew-batches/fermenter-status";
import { BrewCompletionSummary } from "@/features/brew-batches/components/brew-completion-summary";
import { BrewJournal } from "@/features/brew-batches/components/brew-journal";
import { BrewNotes } from "@/features/brew-batches/components/brew-notes";
import { BrewInventory } from "@/features/brew-batches/components/brew-inventory";
import { LiveDashboard } from "@/features/brew-batches/components/live-dashboard";
import { FermentHistoryChart } from "@/features/brew-controller/components/ferment-history-chart";
import { BatchMenu } from "@/features/brew-batches/components/batch-menu";
import { BrewPrepCard } from "@/features/brew-batches/components/brew-prep-card";
import { BrewDayBoard } from "@/features/brew-batches/components/brew-day-board";
import { FermentationBoard } from "@/features/brew-batches/components/fermentation-board";
import { FermenterPanel } from "@/features/brew-batches/components/fermenter-panel";
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

// Дублирует formatAbv из features/labels/slots.ts (тот файл не экспортирует её
// наружу, и его сейчас параллельно правят по задаче наклеек) — тот же формат «~5.6%».
const formatAbvLabel = (value: number | null): string | null => {
  if (value === null) {
    return null;
  }
  const rounded = value.toFixed(1).replace(/\.0$/, "");
  return `~${rounded}%`;
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
  // Подсказка в поле плотности зависит от акта: OG в варочный день, FG на брожении,
  // в итоге/архиве/на устройстве — без подсказки (см. brew-day.ts).
  const measurementKind = brewMeasurementKindForAct(act);
  const device = batch.deviceId ? await getDeviceById(user.id, batch.deviceId) : null;
  // Акт «Брожение» живёт неделями — просим окно по дням (§14), а не варочный лимит
  // «последние 1000 точек» (~3.5 суток при 5-минутном FERMENT-даунсэмпле, обрежет
  // график «план vs факт» на середине брожения). Остальные акты — как раньше.
  const initialHistory = batch.deviceId
    ? await getDeviceTelemetryHistory(
        batch.deviceId,
        batch.id,
        act === "fermentation" ? FERMENT_HISTORY_LIMIT : undefined,
        act === "fermentation" ? FERMENT_HISTORY_WINDOW_DAYS : undefined
      )
    : [];
  const inventoryView = await getBrewBatchInventoryView(user.id, batch.id);

  // Вход в список покупок из акта «Подготовка» (S3, docs/shopping-list-redesign.md
  // D13): считаем нехватку по рецепту ЭТОЙ партии — тем же предикатом
  // isShoppingGapLine, что даёт строки в /app/shopping, чтобы числа на двух
  // поверхностях совпадали. Ошибка матча (рецепт удалён/недоступен) — не должна
  // ронять страницу партии, поэтому просто гасим её в null.
  // brewBatchId — чтобы уже списанное НА ЭТУ партию считалось покрытием (иначе
  // после списания склад партии показывал нехватку теми же позициями, что сам же
  // и списал). Кредит виден только в контексте партии, глобальный матч его не знает.
  let prepShortage: { missingCount: number } | null = null;
  if (act === "prep" && batch.recipeId) {
    try {
      const match = await computeRecipeMatch({ userId: user.id, recipeId: batch.recipeId, brewBatchId: batch.id });
      prepShortage = { missingCount: match.lines.filter(isShoppingGapLine).length };
    } catch {
      prepShortage = null;
    }
  }

  // Гид варочного дня строим для варки без устройства (в done/archived — read-only
  // история) — при устройстве герой варочного дня/итога это device-дашборд, гид не
  // нужен. Акт «Брожение» — ИСКЛЮЧЕНИЕ: чек-лист шагов брожения/розлива нужен ВСЕГДА
  // (паритет автомат/ручной, §8.4) — batch.deviceId там может быть варочным
  // контроллером (openSession не чистит его после варки) или прибором-ферментером,
  // FermentationBoard не подменяется device-дашбордом ни в одном из этих случаев.
  const brewDaySteps = hasDevice && act !== "fermentation" ? [] : buildBrewDaySteps(batch.brewPlanSnapshot);
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
        hiddenAt: sourceRecipe.hiddenAt,
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
  const plannedFermentDays = primaryDurationDays != null ? Math.round(primaryDurationDays) : null;
  const dayLabel = plannedFermentDays != null
    ? `День ${fermentDayN} из ${plannedFermentDays}`
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

  // Связка с прибором-ферментером (§8.4): состояние решаем по LAST-KNOWN кадру
  // initialHistory (уже загружен выше для графика), НЕ по живой SSE-подписке —
  // страница партии не должна держать подписку на прибор неделями брожения.
  // Кандидатов на привязку тянем, только когда пикер реально может понадобиться
  // (без прибора либо прибор больше не в ferment-режиме) — не гоняем запрос зря.
  const fermenterStatus = act === "fermentation" ? resolveFermenterBindingStatus(batch.deviceId, initialHistory) : null;
  const fermenterCandidates =
    fermenterStatus && (fermenterStatus.kind === "unbound" || fermenterStatus.kind === "mode-mismatch")
      ? await listFermenterCandidates(user.id)
      : [];
  const fermenterFreshnessLabel =
    fermenterStatus && (fermenterStatus.kind === "fermenting" || fermenterStatus.kind === "mode-mismatch")
      ? formatRelativeTimestamp(new Date(fermenterStatus.point.ts))
      : null;
  // Линия «план» графика брожения — из плана РЕЦЕПТА (fermentPlan, не живого
  // конфига прибора): та же логика, что грузит ступени в прибор (§13), но здесь
  // read-only и без обращения к устройству — план не обязан совпадать с тем, что
  // сейчас в приборе (владелец мог поправить уставку вручную), это ожидаемо.
  const fermentPlanMapping = act === "fermentation" ? mapFermentationPlanToDeviceSteps(fermentPlan) : null;
  const fermentPlanSteps = fermentPlanMapping?.ok ? fermentPlanMapping.steps : [];

  const started = fmtDate(batch.startedAt);
  const completed = fmtDate(batch.completedAt);
  const planned = fmtDate(batch.plannedFor);

  // Атрибуция источника: варка из чужого рецепта без клона — честно указываем автора.
  const recipeSnapshot = batch.recipeSnapshot as Partial<BrewRecipeSnapshot> | null;
  const sourceAuthorName = recipeSnapshot?.authorName ?? null;
  const isForeignRecipe = Boolean(recipeSnapshot?.authorId && recipeSnapshot.authorId !== batch.userId);

  // Вход «Наклейки» (розлив = этап packaging внутри акта fermentation, см.
  // brew-day.ts:613 — отдельного акта «Розлив» нет, поэтому вход даём в
  // fermentation/done). Дата розлива: completedAt для завершённой варки, иначе
  // сегодня — отдельного поля даты розлива у партии нет.
  // Фактические замеры партии важнее расчётных цифр рецепта/снапшота: наклейка
  // описывает пиво, которое получилось, а не план. OG — первый замер, FG — только
  // финальный, ABV считается от этой пары (см. summarizeBrewMeasurements); чего
  // нет фактически — остаётся расчётным.
  // Свой рецепт (или authorId в снапшоте отсутствует — старые снапшоты без
  // атрибуции считаем своими) → полная студия по рецепту с QR и стилем; факт
  // партии уезжает override-параметрами поверх полей рецепта.
  // Чужой рецепт/рецепт удалён → ручной режим с тем, что есть в снапшоте
  // (стиля/IBU/цвета там нет — это слепок из момента старта варки, не карточка рецепта).
  // Дата — локальная, как в шапке «завершена …» (fmtDate): UTC-срез toISOString
  // для вечерней варки печатал на наклейке вчерашний день.
  const bottlingSource = batch.completedAt ?? new Date();
  const bottlingDateIso = [
    bottlingSource.getFullYear(),
    String(bottlingSource.getMonth() + 1).padStart(2, "0"),
    String(bottlingSource.getDate()).padStart(2, "0")
  ].join("-");
  const isOwnSnapshotRecipe = !recipeSnapshot?.authorId || recipeSnapshot.authorId === batch.userId;
  const labelGravityUnit = resolvePreferredGravityUnit(user.preferredGravityUnit);
  // OG/FG — голым числом: единицу («°P») наклейка ставит сама, одну на строку;
  // formatGravity с суффиксом давал на печати «FG 2.5 °P °P».
  const labelParams = new URLSearchParams({ bottlingDate: bottlingDateIso });
  labelParams.set("batch", String(batch.brewNumber));
  const actualOgText = formatGravityNumber(summary.og, labelGravityUnit);
  if (actualOgText) labelParams.set("og", actualOgText);
  const actualFgText = formatGravityNumber(summary.fg, labelGravityUnit);
  if (actualFgText) labelParams.set("fg", actualFgText);
  const actualAbvText = formatAbvLabel(summary.abv);
  if (actualAbvText) labelParams.set("abv", actualAbvText);
  let labelsHref: string | null = null;
  if (batch.recipeId && isOwnSnapshotRecipe) {
    labelsHref = `/app/recipes/${batch.recipeId}/labels?${labelParams.toString()}`;
  } else if (recipeSnapshot) {
    if (recipeSnapshot.title) labelParams.set("title", recipeSnapshot.title);
    const snapshotOgText = summary.og == null ? formatGravityNumber(recipeSnapshot.og ?? null, labelGravityUnit) : null;
    if (snapshotOgText) labelParams.set("og", snapshotOgText);
    const snapshotFgText = summary.fg == null ? formatGravityNumber(recipeSnapshot.fg ?? null, labelGravityUnit) : null;
    if (snapshotFgText) labelParams.set("fg", snapshotFgText);
    if (actualAbvText == null) {
      const snapshotAbvText = formatAbvLabel(recipeSnapshot.abv ?? null);
      if (snapshotAbvText) labelParams.set("abv", snapshotAbvText);
    }
    if (recipeSnapshot.authorName) labelParams.set("author", recipeSnapshot.authorName);
    labelsHref = `/labels?${labelParams.toString()}`;
  }

  return (
    <div className="space-y-6">
      {/* Тост результата списания после диалога «Сварить» (query-параметр stock).
          useSearchParams требует Suspense-границу. */}
      <Suspense fallback={null}>
        <BrewStockNotice />
      </Suspense>

      <div>
        <Link href="/app/brew-batches" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition hover:text-foreground">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Все партии
        </Link>
      </div>

      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            {/* truncate — длинное название партии не должно раздвигать шапку и
                отталкивать меню (⋯) за пределы узкого экрана. */}
            <h1 className="min-w-0 flex-1 truncate text-2xl font-semibold text-foreground">{batch.name}</h1>
            <span className={`shrink-0 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${brewBatchStatusBadgeClass[batch.status]}`}>
              {brewBatchStatusLabels[batch.status]}
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {batch.brewPlanSnapshot.recipe.title}
            {isForeignRecipe && sourceAuthorName ? <span className="text-muted-foreground"> · автор {sourceAuthorName}</span> : null}
            {` · Партия №${batch.brewNumber}`}
            {completed ? ` · завершена ${completed}` : started ? ` · начата ${started}` : planned ? ` · запланирована на ${planned}` : ""}
          </p>
        </div>
        <BatchMenu brewBatchId={batch.id} status={batch.status} labelsHref={labelsHref} />
      </header>

      {hasDevice && act !== "fermentation" ? (
        // Device-путь: герой — живой дашборд контроллера. Акт «Брожение» сюда НЕ
        // попадает намеренно (см. ветку act === "fermentation" ниже): batch.deviceId
        // может всё ещё указывать на варочный контроллер (openSession его не чистит),
        // а брожению нужен last-known срез + опциональная привязка ИМЕННО прибора-
        // ферментера (§8.4), не живой SSE-дашборд варочного дня.
        <>
          {act === "done" ? (
            <BrewCompletionSummary
              summary={summary}
              preferredGravityUnit={user.preferredGravityUnit}
              batchVolumeL={batch.brewPlanSnapshot.recipe.batchSizeL}
              ratingTarget={ratingTarget}
              labelsHref={labelsHref}
            />
          ) : null}
          <div className="space-y-6 rounded-2xl border border-border bg-card p-4 shadow-sm">
            <h2 className="text-base font-semibold text-foreground">Устройство{device?.name ? ` · ${device.name}` : ""}</h2>
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
            measurementKind={measurementKind}
            hideStats={act === "done"}
          />
          {inventoryView ? (
            <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} prepShortage={prepShortage} />
          ) : null}
          {act === "done" ? <BrewNotes brewBatchId={batch.id} kind="tasting" notes={batch.tastingNotes} /> : null}
          <BrewNotes brewBatchId={batch.id} kind="brew" notes={batch.notes} />
        </>
      ) : act === "prep" ? (
        <>
          <BrewPrepCard
            brewBatchId={batch.id}
            planSummary={planSummary}
            ogTargetLabel={ogTargetLabel}
            plannedForIso={batch.plannedFor ? batch.plannedFor.toISOString() : null}
          />
          {inventoryView ? (
            <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} prepShortage={prepShortage} />
          ) : null}
          <BrewNotes brewBatchId={batch.id} kind="brew" notes={batch.notes} />
        </>
      ) : act === "brewday" ? (
        <>
          <BrewDayBoard brewBatchId={batch.id} groups={brewDaySteps} initialProgress={batch.brewDayProgress} hasOg={hasOg} />
          <BrewJournal
            brewBatchId={batch.id}
            measurements={measurements}
            summary={summary}
            preferredGravityUnit={user.preferredGravityUnit}
            measurementKind={measurementKind}
            title="Начальная плотность (OG)"
          />
          {inventoryView ? <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} /> : null}
          <BrewNotes brewBatchId={batch.id} kind="brew" notes={batch.notes} />
          <BrewQuickDock />
        </>
      ) : act === "fermentation" ? (
        <>
          <FermentationBoard
            brewBatchId={batch.id}
            groups={brewDaySteps}
            initialProgress={batch.brewDayProgress}
            dayLabel={dayLabel}
            fermentDayN={fermentDayN}
            plannedDays={plannedFermentDays}
            targetTempLabel={targetTempLabel}
            nudge={nudge}
          />
          {fermenterStatus ? (
            <FermenterPanel
              brewBatchId={batch.id}
              status={fermenterStatus}
              deviceName={device?.name ?? null}
              candidates={fermenterCandidates}
              freshnessLabel={fermenterFreshnessLabel}
            />
          ) : null}
          {fermenterStatus && fermenterStatus.kind !== "unbound" ? (
            <FermentHistoryChart
              source={{ kind: "batch", brewBatchId: batch.id }}
              hasDevice
              initial={initialHistory}
              planSteps={fermentPlanSteps}
              windowDays={FERMENT_HISTORY_WINDOW_DAYS}
            />
          ) : null}
          <BrewJournal
            brewBatchId={batch.id}
            measurements={measurements}
            summary={summary}
            preferredGravityUnit={user.preferredGravityUnit}
            measurementKind={measurementKind}
            title="Плотность брожения (FG)"
          />
          {inventoryView ? <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} /> : null}
          <BrewNotes brewBatchId={batch.id} kind="brew" notes={batch.notes} />
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
              labelsHref={labelsHref}
            />
          ) : (
            <p className="rounded-2xl border border-border bg-muted p-4 text-sm text-muted-foreground">
              Варка отменена. Вернуть её в план можно через меню в шапке.
            </p>
          )}
          <BrewHistoryGuide brewBatchId={batch.id} groups={brewDaySteps} initialProgress={batch.brewDayProgress} />
          <BrewJournal
            brewBatchId={batch.id}
            measurements={measurements}
            summary={summary}
            preferredGravityUnit={user.preferredGravityUnit}
            measurementKind={measurementKind}
            hideStats={act === "done"}
          />
          {/* Склад завершённой партии — что списано, история движений и возврат (тот
              же блок, что на device-пути: он уже completed-aware и прячет «Списать»).
              Раньше в этой ветке его просто не было, и после завершения варки склад
              партии становился недоступен. */}
          {inventoryView ? <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} /> : null}
          {act === "done" ? <BrewNotes brewBatchId={batch.id} kind="tasting" notes={batch.tastingNotes} /> : null}
          <BrewNotes brewBatchId={batch.id} kind="brew" notes={batch.notes} />
        </>
      )}
    </div>
  );
}
