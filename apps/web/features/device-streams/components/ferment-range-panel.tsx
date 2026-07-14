"use client";

// =============================================================================
//  features/device-streams/components/ferment-range-panel.tsx
//  Обёртка FermentChart для brush-коррекций (§5 F4.2/F4.5, M3-C): владеет
//  выделением диапазона (controlled FermentChart.selection/onRangeSelected),
//  считает N точек в выделении КЛИЕНТСКИ (все точки уже на клиенте — задание
//  M3-C, п.2) и рендерит панель действий «Исключить/Вернуть/Удалить» ВНУТРИ
//  FermentChart (через children), чтобы клик по кнопкам не читался как «клик
//  вне» и не сбрасывал выделение раньше применения действия.
//
//  Выделение может накрывать несколько сеансов сразу (несколько кривых на одном
//  графике партии) — действия применяются к КАЖДОМУ задетому сеансу циклом по
//  *Action (setReadingsExcludedAction/deleteSessionReadingsAction), без отдельной
//  batch-обёртки в corrections.ts: диапазон один и тот же (fromTs/toTs), различаются
//  только sessionId — цикл на клиенте проще и не требует нового серверного контракта.
// =============================================================================
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button, useToast } from "@nb/ui";
import type { PreferredGravityUnit } from "@nb/auth";

import { setReadingsExcludedAction, deleteSessionReadingsAction } from "@/features/device-streams/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import { pluralize } from "@/lib/pluralize";

import { FermentChart, type FermentChartManualMeasurement, type FermentChartRange, type FermentChartSelection, type FermentChartSession } from "./ferment-chart";

type Props = {
  sessions: FermentChartSession[];
  manualMeasurements: FermentChartManualMeasurement[];
  gravityUnit: PreferredGravityUnit;
  defaultRange?: FermentChartRange;
  /**
   * variant="history" (акт «Итог») — история, не пульт (см. batch-ferment-block.tsx):
   * коррекции остаются доступны через карточку устройства/будущие точки входа, но НЕ
   * с read-only страницы итога. false отключает brush целиком (только показ+показать-
   * исключённые остаются, это read-only просмотр, не редактирование).
   */
  interactive?: boolean;
};

type RangeStats = {
  /** sessionId → счётчики точек ЭТОГО сеанса в выделении. */
  bySession: Map<string, { total: number; excluded: number }>;
  total: number;
  excludable: number;
  excluded: number;
};

const computeRangeStats = (sessions: FermentChartSession[], selection: FermentChartSelection): RangeStats => {
  const bySession = new Map<string, { total: number; excluded: number }>();
  let total = 0;
  let excluded = 0;
  for (const session of sessions) {
    let sessionTotal = 0;
    let sessionExcluded = 0;
    for (const point of session.points) {
      if (point.ts < selection.fromTs || point.ts > selection.toTs) continue;
      sessionTotal += 1;
      if (point.excluded) sessionExcluded += 1;
    }
    if (sessionTotal > 0) {
      bySession.set(session.id, { total: sessionTotal, excluded: sessionExcluded });
      total += sessionTotal;
      excluded += sessionExcluded;
    }
  }
  return { bySession, total, excludable: total - excluded, excluded };
};

export function FermentRangePanel({ sessions, manualMeasurements, gravityUnit, defaultRange, interactive = true }: Props) {
  const router = useRouter();
  const { show } = useToast();
  const [selection, setSelection] = useState<FermentChartSelection | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const stats = useMemo(() => (selection ? computeRangeStats(sessions, selection) : null), [sessions, selection]);

  const pointsWord = (count: number) => pluralize(count, ["точка", "точки", "точек"]);

  /**
   * Выделение может накрывать несколько сеансов — каждый *Action мутирует СВОЙ сеанс
   * независимо и уже мог закоммититься на сервере до того, как другой в том же
   * Promise.all упадёт. Поэтому частичный отказ — не «всё было зря»: отражаем в UI
   * то, что реально успело примениться (refresh+сброс выделения), и отдельно
   * сообщаем об ошибке, вместо тихого no-op на уже устаревшем selection.
   */
  const runPerSession = async (
    targets: string[],
    run: (sessionId: string) => Promise<{ ok: true; affected: number } | { ok: false; message: string }>
  ): Promise<{ affected: number; hasSuccess: boolean; hasFailure: boolean; firstErrorMessage: string | null }> => {
    const results = await Promise.all(targets.map((id) => run(id)));
    const failures = results.filter((r): r is { ok: false; message: string } => !r.ok);
    const affected = results.reduce((sum, r) => sum + (r.ok ? r.affected : 0), 0);
    return {
      affected,
      hasSuccess: results.some((r) => r.ok),
      hasFailure: failures.length > 0,
      firstErrorMessage: failures[0]?.message ?? null
    };
  };

  const excludeRange = async () => {
    if (!selection || !stats || pending) return;
    setPending(true);
    try {
      const targets = [...stats.bySession.keys()];
      const outcome = await runPerSession(targets, async (sessionId) => {
        const result = await setReadingsExcludedAction({
          sessionId,
          fromTs: new Date(selection.fromTs),
          toTs: new Date(selection.toTs),
          excluded: true
        });
        return result.ok ? { ok: true, affected: result.result.affected } : { ok: false, message: result.message };
      });
      if (outcome.hasFailure) show({ title: outcome.firstErrorMessage ?? "Не удалось исключить часть точек.", tone: "danger" });
      if (outcome.hasSuccess) {
        show({ title: `Исключено ${outcome.affected} ${pointsWord(outcome.affected)}`, tone: "success" });
        setSelection(null);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  const restoreRange = async () => {
    if (!selection || !stats || pending) return;
    setPending(true);
    try {
      const targets = [...stats.bySession.keys()];
      const outcome = await runPerSession(targets, async (sessionId) => {
        const result = await setReadingsExcludedAction({
          sessionId,
          fromTs: new Date(selection.fromTs),
          toTs: new Date(selection.toTs),
          excluded: false
        });
        return result.ok ? { ok: true, affected: result.result.affected } : { ok: false, message: result.message };
      });
      if (outcome.hasFailure) show({ title: outcome.firstErrorMessage ?? "Не удалось вернуть часть точек.", tone: "danger" });
      if (outcome.hasSuccess) {
        show({ title: `Возвращено ${outcome.affected} ${pointsWord(outcome.affected)}`, tone: "success" });
        setSelection(null);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  const deleteRange = async () => {
    if (!selection || !stats || pending) return;
    setPending(true);
    setDeleteError(null);
    try {
      const targets = [...stats.bySession.keys()];
      const outcome = await runPerSession(targets, async (sessionId) => {
        const result = await deleteSessionReadingsAction({
          sessionId,
          fromTs: new Date(selection.fromTs),
          toTs: new Date(selection.toTs)
        });
        return result.ok ? { ok: true, affected: result.result.deletedCount } : { ok: false, message: result.message };
      });
      if (!outcome.hasSuccess) {
        setDeleteError(outcome.firstErrorMessage ?? "Не удалось удалить точки. Попробуйте ещё раз.");
        return;
      }
      if (outcome.hasFailure) show({ title: outcome.firstErrorMessage ?? "Часть точек не удалось удалить.", tone: "danger" });
      show({ title: `Удалено ${outcome.affected} ${pointsWord(outcome.affected)}`, tone: "success" });
      setDeleteOpen(false);
      setSelection(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  };

  return (
    <FermentChart
      sessions={sessions}
      manualMeasurements={manualMeasurements}
      gravityUnit={gravityUnit}
      defaultRange={defaultRange}
      interactive={interactive}
      selection={selection}
      onRangeSelected={setSelection}
    >
      {interactive && selection && stats && stats.total > 0 ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Выделено {stats.total} {pointsWord(stats.total)}
          </span>
          {stats.excludable > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void excludeRange()} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Исключить точки ({stats.excludable})
            </Button>
          ) : null}
          {stats.excluded > 0 ? (
            <Button type="button" variant="outline" size="sm" onClick={() => void restoreRange()} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
              Вернуть точки ({stats.excluded})
            </Button>
          ) : null}
          <Button type="button" variant="dangerOutline" size="sm" onClick={() => setDeleteOpen(true)} disabled={pending}>
            Удалить точки ({stats.total})
          </Button>
        </div>
      ) : null}

      <ConfirmActionDialog
        open={deleteOpen}
        title={`Удалить ${stats?.total ?? 0} ${pointsWord(stats?.total ?? 0)}?`}
        description="Точки будут удалены безвозвратно. Кривая и вердикт брожения пересчитаются без них."
        confirmLabel="Удалить"
        pendingLabel="Удаляем…"
        pending={pending}
        error={deleteError}
        onConfirm={() => void deleteRange()}
        onClose={() => {
          if (!pending) setDeleteOpen(false);
        }}
      />
    </FermentChart>
  );
}
