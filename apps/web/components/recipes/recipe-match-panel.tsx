"use client";

import React, { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";

import { addRecipeIngredientToInventory, loadRecipeMatch, type RecipeMatchViewerState } from "@/app/(public)/recipes/[slug]/match-actions";
import type { RecipeMatchDto, RecipeMatchLineDto, RecipeMatchLineStatus, RecipeMatchLabel } from "@/features/recipes/contracts";
import { inventoryUnitShortLabels } from "@/features/inventory/units";
import { redirectToLoginWithNext } from "@/lib/auth-links";

const statusMeta: Record<RecipeMatchLineStatus, { label: string; pill: string }> = {
  covered: { label: "Есть", pill: "bg-success-subtle text-success-subtle-foreground ring-success/30" },
  substitute: { label: "Аналог", pill: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30" },
  partial: { label: "Частично", pill: "bg-warning-subtle text-warning-subtle-foreground ring-warning/30" },
  missing: { label: "Нет", pill: "bg-destructive-subtle text-destructive-subtle-foreground ring-destructive-border" }
};

const labelMeta: Record<RecipeMatchLabel, { text: string; accent: string }> = {
  ready: { text: "Можно сварить из ваших запасов", accent: "text-success" },
  almost: { text: "Почти всё есть на складе", accent: "text-success" },
  partial: { text: "Часть ингредиентов уже есть", accent: "text-warning-subtle-foreground" },
  none: { text: "Подходящих ингредиентов на складе нет", accent: "text-muted-foreground" }
};

const percentRingColor = (matchPercent: number) => {
  if (matchPercent >= 100) return "text-success";
  if (matchPercent >= 70) return "text-lime-600 dark:text-lime-400";
  if (matchPercent >= 1) return "text-warning-subtle-foreground";
  return "text-muted-foreground";
};

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

export function RecipeMatchPanelView({ match, onChanged }: { match: RecipeMatchDto; onChanged: () => void | Promise<void> }) {
  if (match.totalLines === 0) {
    return null;
  }

  const label = labelMeta[match.label];
  // Недостающие/частичные строки с каталожной привязкой и понятным количеством —
  // их можно докинуть на склад прямо отсюда.
  const gaps = match.lines.filter(
    (line) =>
      (line.status === "missing" || line.status === "partial")
      && line.ingredientCatalogItemId
      && line.suggestedAddQuantity != null
      && line.suggestedAddUnit
  );

  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold tabular-nums ring-2 ring-current ${percentRingColor(match.matchPercent)}`}>
          {match.matchPercent}%
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Совпадение со складом</h2>
          <p className={`text-sm font-medium ${label.accent}`}>{label.text}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Есть {match.coveredLines} из {match.totalLines}
            {match.missingCount > 0 ? ` · не хватает ${match.missingCount}` : ""}
            {match.scaledToInventory ? ` · расчёт под ${numberFormatter.format(match.targetBatchVolumeL)} л` : ""}
          </p>
        </div>
      </div>

      {gaps.length > 0 ? (
        <div className="space-y-1.5 border-t border-border pt-3">
          <h3 className="text-xs font-medium text-muted-foreground">Не хватает на складе</h3>
          <ul className="space-y-1.5">
            {gaps.map((line) => (
              <MatchGapRow key={line.recipeIngredientId} line={line} onAdded={onChanged} />
            ))}
          </ul>
        </div>
      ) : null}

      <details className="group border-t border-border pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground">
          <span>Что есть и чего не хватает</span>
          <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" aria-hidden />
        </summary>
        <ul className="mt-2 space-y-1">
          {match.lines.map((line) => {
            const meta = statusMeta[line.status];
            return (
              <li key={line.recipeIngredientId} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 truncate text-foreground">{line.ingredientDisplayName ?? "—"}</span>
                <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ${meta.pill}`}>
                  {meta.label}
                  {line.status === "partial" ? ` ${line.coveragePercent}%` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    </section>
  );
}

/**
 * Строка недостающего ингредиента с действием «На склад»: разворачивает поле с
 * предзаполненным количеством (нехватка в человеческой единице) и кладёт позицию
 * в склад. После успеха родитель перезапрашивает матч — строка зеленеет/исчезает.
 */
function MatchGapRow({ line, onAdded }: { line: RecipeMatchLineDto; onAdded: () => void | Promise<void> }) {
  const unit = line.suggestedAddUnit!;
  const unitLabel = inventoryUnitShortLabels[unit] ?? unit;
  const errorId = `gap-error-${line.recipeIngredientId}`;
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(() => String(line.suggestedAddQuantity ?? ""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Открываем форму всегда с актуальным предложением: если строка осталась
  // partial после прошлого добавления, нехватка уже меньше — берём свежее число.
  const openRow = () => {
    setQuantity(String(line.suggestedAddQuantity ?? ""));
    setError(null);
    setOpen(true);
  };

  const submit = async () => {
    const value = Number(quantity.replace(",", "."));
    if (!Number.isFinite(value) || value <= 0) {
      setError("Введите количество.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await addRecipeIngredientToInventory({
      ingredientCatalogItemId: line.ingredientCatalogItemId,
      enteredQuantity: value,
      enteredUnit: unit
    });
    if (result.authRequired) {
      redirectToLoginWithNext();
      return; // уходим на /login — pending намеренно остаётся, кнопка не активна
    }
    if (!result.ok) {
      setPending(false);
      setError(result.message);
      return;
    }
    // Держим pending до конца перезапроса матча — иначе строка ещё видна с
    // активной кнопкой, и повторный клик создаст дубль на складе.
    await onAdded();
    setOpen(false);
    setPending(false);
  };

  return (
    <li className="rounded-lg bg-muted px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-sm text-foreground">{line.ingredientDisplayName ?? "—"}</span>
        {open ? null : (
          <button
            type="button"
            onClick={openRow}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border transition hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            На склад
          </button>
        )}
      </div>
      {open ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            min={0}
            step="any"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            disabled={pending}
            aria-label={`Количество, ${unitLabel}`}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="h-8 w-24 rounded-md border border-border px-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">{unitLabel}</span>
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="inline-flex items-center gap-1 rounded-md bg-foreground px-2.5 py-1.5 text-xs font-medium text-background transition hover:bg-foreground/90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : <Check className="h-3.5 w-3.5" aria-hidden />}
            Добавить
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); setError(null); }}
            disabled={pending}
            aria-label="Отмена"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
      {error ? <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}
    </li>
  );
}

/**
 * Панель «Совпадение со складом» на публичной странице рецепта. Персональный
 * матчинг тянется ПОСЛЕ гидрации через server action, чтобы документ оставался
 * кэшируемым для анонимов (тот же приём, что и форма оценки).
 */
export function RecipeMatchPanel({ recipeId }: { recipeId: string }) {
  const [state, setState] = useState<RecipeMatchViewerState | null>(null);

  // Перезапрос матча после добавления на склад: computeRecipeMatch читает склад
  // на лету, поэтому достаточно повторно дёрнуть action — строка станет covered.
  // Разовая ошибка перезапроса не должна выкидывать залогиненного в аноним или
  // схлопывать панель: сохраняем прежнее состояние / прежний матч.
  const reload = useCallback(async () => {
    try {
      const next = await loadRecipeMatch(recipeId);
      setState((prev) => (!next.match && prev?.match ? prev : next));
    } catch {
      setState((prev) => prev ?? { authenticated: false, match: null });
    }
  }, [recipeId]);

  useEffect(() => {
    let active = true;
    loadRecipeMatch(recipeId)
      .then((next) => {
        if (active) {
          setState(next);
        }
      })
      .catch(() => {
        if (active) {
          setState({ authenticated: false, match: null });
        }
      });
    return () => {
      active = false;
    };
  }, [recipeId]);

  if (!state) {
    return null;
  }

  if (!state.authenticated) {
    return (
      <section className="rounded-2xl border border-border bg-card p-4 text-sm text-muted-foreground shadow-sm">
        <button
          type="button"
          onClick={() => redirectToLoginWithNext()}
          className="font-medium text-foreground underline underline-offset-2"
        >
          Войдите
        </button>
        , чтобы увидеть, сколько ингредиентов для этого рецепта есть на вашем складе.
      </section>
    );
  }

  if (!state.match) {
    return null;
  }

  return <RecipeMatchPanelView match={state.match} onChanged={reload} />;
}
