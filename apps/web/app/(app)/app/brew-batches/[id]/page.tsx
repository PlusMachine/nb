import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";

import { requireUser } from "@/lib/auth";
import { getBrewBatchDetail, getDeviceTelemetryHistory } from "@/features/brew-batches/service";
import { getBrewBatchInventoryView } from "@/features/brew-batches/inventory";
import { buildBrewDaySteps } from "@/features/brew-batches/brew-day";
import { resolveBrewCompletionRatingSlug } from "@/features/brew-batches/completion";
import { brewBatchStatusBadgeClass, brewBatchStatusLabels } from "@/features/brew-batches/contracts";
import { getDeviceById } from "@/features/devices/service";
import { deviceChannel } from "@/features/brew-controller";
import { getRecipeById } from "@/features/recipes/service";
import { BrewLifecycle } from "@/features/brew-batches/components/brew-lifecycle";
import { BrewCompletionSummary } from "@/features/brew-batches/components/brew-completion-summary";
import { BrewJournal } from "@/features/brew-batches/components/brew-journal";
import { BrewNotes } from "@/features/brew-batches/components/brew-notes";
import { BrewDayGuide } from "@/features/brew-batches/components/brew-day-guide";
import { BrewInventory } from "@/features/brew-batches/components/brew-inventory";
import { LiveDashboard } from "@/features/brew-batches/components/live-dashboard";

const dateFmt = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" });
const fmtDate = (value: Date | null) => (value ? dateFmt.format(new Date(value)) : null);

// Центр управления варкой: инфо о партии, жизненный цикл, журнал замеров OG/FG и
// заметки. Дашборд устройства BrewForge показывается секцией, когда партия
// привязана к контроллеру. Серверно: requireUser → деталь (ownership) → устройство.
export default async function BrewBatchDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;

  const detail = await getBrewBatchDetail(user.id, id);
  if (!detail) {
    notFound();
  }

  const { batch, measurements, summary } = detail;
  const hasDevice = Boolean(batch.deviceId);
  const isCompleted = batch.status === "completed";
  const device = batch.deviceId ? await getDeviceById(user.id, batch.deviceId) : null;
  const initialHistory = batch.deviceId ? await getDeviceTelemetryHistory(batch.deviceId, batch.id) : [];
  const inventoryView = await getBrewBatchInventoryView(user.id, batch.id);
  // Виртуальный гид варочного дня — для варки без устройства (device-дашборд иначе)
  // и пока варка не завершена (после completed это уже история, не инструкция).
  const brewDaySteps = hasDevice || isCompleted ? [] : buildBrewDaySteps(batch.brewPlanSnapshot);

  // Оценка исходного рецепта в итоге варки: свежий запрос (не снапшот) — рецепт
  // мог с момента варки уйти в приват/удалиться. NOT_FOUND/FORBIDDEN → просто не
  // показываем блок, страницу не роняем.
  let ratingTarget: { recipeId: string; slug: string } | null = null;
  if (isCompleted && batch.recipeId) {
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

  const started = fmtDate(batch.startedAt);
  const completed = fmtDate(batch.completedAt);
  const planned = fmtDate(batch.plannedFor);

  // Атрибуция источника: партию можно сварить из чужого рецепта без клона —
  // тогда честно указываем автора (по снапшоту, переживает удаление источника).
  const recipeSnapshot = batch.recipeSnapshot as { authorId?: string | null; authorName?: string | null } | null;
  const sourceAuthorName = recipeSnapshot?.authorName ?? null;
  const isForeignRecipe = Boolean(recipeSnapshot?.authorId && recipeSnapshot.authorId !== batch.userId);

  return (
    <div className="space-y-6">
      <div>
        <Link href="/app/brew-batches" className="inline-flex items-center gap-1 text-sm text-zinc-500 transition hover:text-zinc-800">
          <ChevronLeft className="h-4 w-4" aria-hidden />
          Все варки
        </Link>
      </div>

      <header className="space-y-1">
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
      </header>

      <BrewLifecycle brewBatchId={batch.id} status={batch.status} />

      {isCompleted ? (
        <BrewCompletionSummary
          summary={summary}
          preferredGravityUnit={user.preferredGravityUnit}
          batchVolumeL={batch.brewPlanSnapshot.recipe.batchSizeL}
          ratingTarget={ratingTarget}
        />
      ) : null}

      {!hasDevice && brewDaySteps.length > 0 ? (
        <BrewDayGuide brewBatchId={batch.id} groups={brewDaySteps} initialProgress={batch.brewDayProgress} />
      ) : null}

      <BrewJournal
        brewBatchId={batch.id}
        measurements={measurements}
        summary={summary}
        preferredGravityUnit={user.preferredGravityUnit}
        hideStats={isCompleted}
      />

      {inventoryView ? (
        <BrewInventory brewBatchId={batch.id} view={inventoryView} status={batch.status} />
      ) : null}

      <BrewNotes brewBatchId={batch.id} notes={batch.notes} completed={isCompleted} />

      {hasDevice ? (
        <div className="space-y-6 border-t border-zinc-100 pt-6">
          <h2 className="text-base font-semibold text-zinc-900">Устройство</h2>
          <LiveDashboard
            source={{ kind: "batch", brewBatchId: batch.id }}
            subtitle={device?.name ?? null}
            hasDevice={hasDevice}
            channel={device ? deviceChannel(device) : null}
            initialHistory={initialHistory}
          />
        </div>
      ) : null}
    </div>
  );
}
