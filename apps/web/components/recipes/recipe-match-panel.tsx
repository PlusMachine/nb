"use client";

import React, { useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Check, ChevronDown, Loader2, Plus, X } from "lucide-react";

import { useToast } from "@nb/ui";

import { addRecipeIngredientToInventory, loadMatchIngredientCard } from "@/app/(public)/recipes/[slug]/match-actions";
import type { RecipeMatchDto, RecipeMatchLineDto, RecipeMatchLineStatus, RecipeMatchLabel } from "@/features/recipes/contracts";
import { buildCatalogDetailHref, buildIngredientNameActionHref } from "@/features/ingredients/catalog-links";
import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";
import { ingredientCategoryLabels } from "@/features/ingredients/presentation";
import { inventoryUnitShortLabels } from "@/features/inventory/units";
import { redirectToLoginWithNext } from "@/lib/auth-links";

import { useRecipeMatch } from "./recipe-match-context";

// ingredient-picker.tsx (~3100 строк) — тяжёлый клиентский чанк, нужный только
// когда пользователь разворачивает строку «На склад» (Ф24). Панель матча
// рендерится на публичной странице рецепта для всех (включая анонимов, кому
// сама панель не видна) — статический импорт раздувал бы общий чанк страницы.
// ssr:false допустим — модуль уже "use client", а карточка и так появляется
// только после гидрации по клику.
const IngredientSelectionCard = dynamic(
  () => import("@/components/ingredients/ingredient-picker").then((m) => m.IngredientSelectionCard),
  { ssr: false, loading: () => null }
);

const statusMeta: Record<RecipeMatchLineStatus, { label: string; pill: string }> = {
  covered: { label: "Есть", pill: "bg-success-subtle text-success-subtle-foreground ring-success/30" },
  substitute: { label: "Аналог", pill: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30" },
  partial: { label: "Частично", pill: "bg-warning-subtle text-warning-subtle-foreground ring-warning/30" },
  missing: { label: "Нет", pill: "bg-destructive-subtle text-destructive-subtle-foreground ring-destructive-border" }
};

// Экспортированы — переиспользуются мобильной плашкой-вердиктом
// (recipe-match-mobile-badge.tsx), чтобы не заводить вторую копию расцветки.
export const labelMeta: Record<RecipeMatchLabel, { text: string; accent: string }> = {
  ready: { text: "Можно сварить из ваших запасов", accent: "text-success" },
  almost: { text: "Почти всё есть на складе", accent: "text-success" },
  partial: { text: "Часть ингредиентов уже есть", accent: "text-warning-subtle-foreground" },
  none: { text: "Подходящих ингредиентов на складе нет", accent: "text-muted-foreground" }
};

export const percentRingColor = (matchPercent: number) => {
  if (matchPercent >= 100) return "text-success";
  if (matchPercent >= 70) return "text-lime-600 dark:text-lime-400";
  if (matchPercent >= 1) return "text-warning-subtle-foreground";
  return "text-muted-foreground";
};

const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

// Ф25: «частичное = не хватает» — счётчик в шапке и мобильной плашке всегда
// равен числу строк в списке «Не хватает на складе» (missing ИЛИ partial),
// иначе владельческое решение «частичное считается нехваткой» разъезжается со
// старым `match.missingCount` (только missing, семантика зафиксирована для
// брони способности сварить/списка покупок — её трогать нельзя, см. Ф25 в ТЗ).
// Экспортированы — переиспользуются мобильной плашкой (recipe-match-mobile-badge.tsx).
export const isStockGapLine = (line: RecipeMatchLineDto) => line.status === "missing" || line.status === "partial";
export const countStockGaps = (lines: RecipeMatchLineDto[]) => lines.filter(isStockGapLine).length;

// Ф25: строка-нехватка с понятной каталожной/кастомной привязкой и предложенным
// количеством — можно докинуть на склад прямо отсюда (MatchGapRow). Иначе —
// name-only (MatchGapNameRow). Разбиение исчерпывающее: каждая gap-строка
// попадает ровно в одну из двух групп, счётчик===списку без зазора.
const hasStockGapAddEntry = (line: RecipeMatchLineDto) => (
  Boolean(line.ingredientCatalogItemId || line.userCustomIngredientId)
  && line.suggestedAddQuantity != null
  && Boolean(line.suggestedAddUnit)
);

// Ф23: подпись под именем строки — «категория · бренд» (бренда может не быть).
const buildIngredientSubtitle = (line: Pick<RecipeMatchLineDto, "category" | "brand">) => {
  const categoryLabel = line.category ? ingredientCategoryLabels[line.category] : null;
  return [categoryLabel, line.brand].filter(Boolean).join(" · ") || null;
};

export function RecipeMatchPanelView({ match, onChanged }: { match: RecipeMatchDto; onChanged: () => void | Promise<void> }) {
  if (match.totalLines === 0) {
    return null;
  }

  const label = labelMeta[match.label];
  // Ф25: единый набор нехваток (missing ИЛИ partial) — счётчик в шапке всегда
  // равен gapLines.length, то есть сумме строк ниже (withEntry + nameOnly).
  const gapLines = match.lines.filter(isStockGapLine);
  // Недостающие/частичные строки с каталожной или кастомной привязкой и понятным
  // количеством — их можно докинуть на склад прямо отсюда.
  const gaps = gapLines.filter(hasStockGapAddEntry);
  // П3: строки-нехватки без привязки вовсе (живут только именем из снапшота —
  // типично для импортированных рецептов) раньше были тупиком без действий.
  // Вместо инлайн-формы — две ссылки: найти в каталоге / завести свой ингредиент.
  const nameOnlyGaps = gapLines.filter((line) => !hasStockGapAddEntry(line));

  return (
    <section id="match-panel" className="scroll-mt-[calc(var(--chrome-top,0px)+1rem)] space-y-3 rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-muted text-lg font-semibold tabular-nums ring-2 ring-current ${percentRingColor(match.matchPercent)}`}>
          {match.matchPercent}%
        </div>
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-foreground">Совпадение со складом</h2>
          <p className={`text-sm font-medium ${label.accent}`}>{label.text}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Есть {match.coveredLines} из {match.totalLines}
            {gapLines.length > 0 ? (
              <>
                {" · "}
                <Link href="/app/shopping" className="underline decoration-dotted underline-offset-2 transition-colors hover:text-foreground">
                  не хватает {gapLines.length}
                </Link>
              </>
            ) : null}
            {match.scaledToInventory ? ` · расчёт под ${numberFormatter.format(match.targetBatchVolumeL)} л` : ""}
          </p>
          {match.hasEquipmentProfile === false ? (
            <p className="mt-1 text-xs text-muted-foreground">
              Расчёт под объём рецепта {numberFormatter.format(match.recipeBatchVolumeL)} л.{" "}
              <Link href="/app/equipment" className="underline decoration-dotted underline-offset-2 hover:text-foreground">
                Задайте оборудование, чтобы пересчитать под свой котёл
              </Link>
            </p>
          ) : null}
        </div>
      </div>

      {gaps.length > 0 || nameOnlyGaps.length > 0 ? (
        <div className="space-y-1.5 border-t border-border pt-3">
          <h3 className="text-xs font-medium text-muted-foreground">Не хватает на складе</h3>
          <ul className="space-y-1.5">
            {gaps.map((line) => (
              <MatchGapRow key={line.recipeIngredientId} line={line} targetBatchVolumeL={match.targetBatchVolumeL} onAdded={onChanged} />
            ))}
            {nameOnlyGaps.map((line) => (
              <MatchGapNameRow key={line.recipeIngredientId} line={line} />
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
            const subtitle = buildIngredientSubtitle(line);
            return (
              <li key={line.recipeIngredientId} className="flex items-start justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate text-foreground">{line.ingredientDisplayName ?? "—"}</span>
                  {subtitle ? <span className="block truncate text-xs text-muted-foreground">{subtitle}</span> : null}
                </span>
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
 * Строка недостающего ингредиента с действием «На склад»: разворачивает
 * карточку ингредиента (Ф24) + поле с предзаполненным количеством (нехватка в
 * человеческой единице) и кладёт позицию в склад. После успеха родитель
 * перезапрашивает матч — строка зеленеет/исчезает.
 */
function MatchGapRow({
  line,
  targetBatchVolumeL,
  onAdded
}: {
  line: RecipeMatchLineDto;
  targetBatchVolumeL: number;
  onAdded: () => void | Promise<void>;
}) {
  const unit = line.suggestedAddUnit!;
  const unitLabel = inventoryUnitShortLabels[unit] ?? unit;
  const errorId = `gap-error-${line.recipeIngredientId}`;
  const detailHref = buildCatalogDetailHref({
    catalogItemId: line.ingredientCatalogItemId,
    customId: line.userCustomIngredientId,
    name: line.ingredientDisplayName
  });
  const subtitle = buildIngredientSubtitle(line);
  const { show } = useToast();
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(() => String(line.suggestedAddQuantity ?? ""));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Ф24: карточка ингредиента в развороте — грузится один раз при первом
  // открытии строки и кэшируется (cardRequested), повторные открытия/закрытия
  // не бьют по серверу заново.
  const [card, setCard] = useState<IngredientSuggestionItem | null>(null);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardRequested, setCardRequested] = useState(false);

  // Открываем форму всегда с актуальным предложением: если строка осталась
  // partial после прошлого добавления, нехватка уже меньше — берём свежее число.
  const openRow = () => {
    setQuantity(String(line.suggestedAddQuantity ?? ""));
    setError(null);
    setOpen(true);
    if (!cardRequested) {
      setCardRequested(true);
      setCardLoading(true);
      loadMatchIngredientCard({
        ingredientCatalogItemId: line.ingredientCatalogItemId,
        userCustomIngredientId: line.userCustomIngredientId
      })
        .then((state) => setCard(state.item))
        .catch(() => setCard(null))
        .finally(() => setCardLoading(false));
    }
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
      userCustomIngredientId: line.userCustomIngredientId,
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
    show({ title: "Добавили на склад", tone: "success" });
    setOpen(false);
    setPending(false);
  };

  return (
    <li className="rounded-lg bg-muted px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          {/* Тач-таргет ссылки-имени растим невидимым before-псевдоэлементом
              (паттерн проекта, см. mobile-audit) до ~44px по высоте, не трогая
              видимую компоновку «имя + кнопка в ряд» и не наезжая на подпись
              категория·бренд под именем или на соседнюю кнопку «На склад». */}
          <Link
            href={detailHref}
            className="relative block truncate text-sm font-medium text-foreground before:absolute before:-inset-x-2 before:-inset-y-3 before:content-[''] hover:underline"
          >
            {line.ingredientDisplayName ?? "—"}
          </Link>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
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
        <div className="mt-2 space-y-2">
          {cardLoading ? (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Загружаем…
            </div>
          ) : card ? (
            // Карточка появляется автоматически по клику «На склад» (инфо-превью
            // недостающего ингредиента, Ф24) — это не акт выбора пользователем,
            // поэтому дефолтный label="Выбрано" здесь неуместен.
            // Фон: строка (li) уже bg-muted, а IngredientSelectionCard красится
            // в bg-muted по умолчанию — визуально сливается с единственной
            // границей 1px. bg-card проигрывает bg-muted по порядку в
            // компилируемом CSS (проверено сборкой tailwind: .bg-card раньше
            // .bg-muted в выводе → при равной специфичности muted перекрывает),
            // поэтому нужен !bg-card (важность), которая гарантированно
            // перекрывает — подтверждено скриншотом в light/dark.
            <IngredientSelectionCard
              item={card}
              label={card.source === "custom" ? "Ваш ингредиент" : "Из каталога"}
              className="!bg-card"
            />
          ) : null}
          {targetBatchVolumeL > 0 ? (
            <p className="text-xs text-muted-foreground">
              Нехватка под расчётный объём {numberFormatter.format(targetBatchVolumeL)} л
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
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
        </div>
      ) : null}
      {error ? <p id={errorId} role="alert" className="mt-1 text-xs text-destructive">{error}</p> : null}
    </li>
  );
}

/**
 * Строка недостающего ингредиента без каталожной/кастомной привязки (живёт
 * только именем из снапшота — П3): вместо инлайн-формы «На склад» (нечего
 * докидывать — позиции ещё не существует) — две ссылки на выход из тупика:
 * найти существующий каталожный аналог или сразу завести свой ингредиент
 * (deeplink с предзаполненным именем/количеством открывает форму «Добавить свой»).
 */
function MatchGapNameRow({ line }: { line: RecipeMatchLineDto }) {
  const name = line.ingredientDisplayName ?? "Ингредиент";
  const catalogHref = `/catalog?q=${encodeURIComponent(name)}`;
  const amount = line.suggestedAddQuantity != null && line.suggestedAddUnit
    ? { quantity: line.suggestedAddQuantity, unit: line.suggestedAddUnit }
    : null;
  const addHref = buildIngredientNameActionHref("/app/ingredients", name, amount, line.category);
  const subtitle = buildIngredientSubtitle(line);

  return (
    <li className="rounded-lg bg-muted px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="block truncate text-sm text-foreground">{name}</span>
          {subtitle ? <p className="truncate text-xs text-muted-foreground">{subtitle}</p> : null}
        </div>
        <span className="flex shrink-0 items-center gap-1.5">
          <Link
            href={catalogHref}
            className="inline-flex items-center rounded-full bg-card px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border transition hover:bg-accent"
          >
            Найти в каталоге
          </Link>
          <Link
            href={addHref}
            className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1 text-xs font-medium text-foreground ring-1 ring-border transition hover:bg-accent"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Добавить свой
          </Link>
        </span>
      </div>
    </li>
  );
}

/**
 * Панель «Совпадение со складом» на публичной странице рецепта. Персональный
 * матчинг тянется ПОСЛЕ гидрации через server action (в {@link RecipeMatchProvider},
 * который оборачивает страницу), чтобы документ оставался кэшируемым для
 * анонимов (тот же приём, что и форма оценки). Панель — один из потребителей
 * общего контекста наравне с мобильной плашкой-вердиктом и кнопкой «В закладки».
 */
export function RecipeMatchPanel() {
  const ctx = useRecipeMatch();
  const state = ctx?.state ?? null;
  const reload = ctx?.reload ?? (async () => {});

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
