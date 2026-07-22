"use client";

import { useMemo, useState } from "react";
import { CircleCheck, PackageSearch } from "lucide-react";

import type { ShoppingListDto, ShoppingListLineDto, ShoppingManualItemDto } from "@/features/shopping/contracts";
import type { IngredientCategory } from "@/features/ingredients/contracts";
import { inventoryCategoryLabels, inventoryCategoryOrder } from "@/features/inventory/page-model";

import { ShoppingLabHeader } from "./shopping-lab-header";
import { ShoppingLabLineRow } from "./shopping-lab-line-row";
import { ShoppingLabManualItemRow } from "./shopping-lab-manual-item-row";

// «12 июля» — тот же форматтер, что и у боевой shopping-list-view.tsx.
const plannedForFormatter = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long" });

type MergedRow =
  | { kind: "derived"; key: string; name: string; line: ShoppingListLineDto }
  | { kind: "manual"; key: string; name: string; item: ShoppingManualItemDto };

/**
 * Режим «Все варки»: производные строки §3.2 + ручные позиции («Своё»)
 * слиты в один сплошной список по категориям (inventoryCategoryOrder,
 * "other" последним) — без отдельной секции «Своё» и без текстовых
 * eyebrow-ярлыков категорий (их роль теперь несёт иконка на строке, см.
 * ShoppingLabLineRow/ShoppingLabManualItemRow). Порядок категорий сохраняет
 * группировку для сортировки, но на выходе — плоская последовательность строк
 * с единой полосой разделителей (divide-y), а не отдельные визуальные блоки.
 */
function buildMergedRows(groups: ShoppingListDto["groups"], manualItems: ShoppingManualItemDto[]): MergedRow[] {
  const rowsByCategory = new Map<IngredientCategory | "other", MergedRow[]>();

  for (const group of groups) {
    rowsByCategory.set(
      group.category,
      group.items.map((line) => ({ kind: "derived" as const, key: line.key, name: line.ingredientDisplayName, line }))
    );
  }

  for (const item of manualItems) {
    const category = item.category ?? "other";
    const bucket = rowsByCategory.get(category) ?? [];
    bucket.push({ kind: "manual" as const, key: item.id, name: item.name, item });
    rowsByCategory.set(category, bucket);
  }

  const orderedCategories: (IngredientCategory | "other")[] = [...inventoryCategoryOrder, "other"];
  return orderedCategories
    .filter((category) => rowsByCategory.has(category))
    .flatMap((category) => [...rowsByCategory.get(category)!].sort((a, b) => a.name.localeCompare(b.name, "ru")));
}

// Чипы-фильтр по варкам (решение владельца, v4): «Все варки» + по чипу на
// каждую запланированную варку. Рендерится только когда варок больше одной —
// с одной варкой фильтровать нечего, список и так весь про неё.
function BrewFilterChips({
  plannedBrews,
  selectedBrewId,
  onSelect
}: {
  plannedBrews: ShoppingListDto["plannedBrews"];
  selectedBrewId: string | null;
  onSelect: (brewBatchId: string | null) => void;
}) {
  const pillClassName = (active: boolean) =>
    `inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
      active
        ? "border-foreground bg-foreground text-background"
        : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted"
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      <button type="button" className={pillClassName(selectedBrewId === null)} onClick={() => onSelect(null)}>
        Все варки
      </button>
      {plannedBrews.map((brew) => (
        <button
          key={brew.brewBatchId}
          type="button"
          className={pillClassName(selectedBrewId === brew.brewBatchId)}
          onClick={() => onSelect(brew.brewBatchId)}
        >
          {brew.brewName}
          {brew.plannedFor ? <span> · {plannedForFormatter.format(brew.plannedFor)}</span> : null}
        </button>
      ))}
    </div>
  );
}

/**
 * v4 лаборатории раздела «Чего не хватает» (/app/shopping-lab) — ответ на
 * критику владельца по итогам v3:
 *  1. Список разбит по варкам через чипы-фильтр (BrewFilterChips) вместо
 *     плоской секции «Не хватает для варок» + отдельного списка ниже —
 *     секция SourceBrewRows убрана целиком, её работу теперь выполняют чипы.
 *  2. Категория строки — иконка в кружке (ShoppingLabLineRow), не текстовый
 *     eyebrow-ярлык группы: подписи категорий заняли много места и спорили с
 *     именами позиций за внимание.
 *  3. Строки говорят языком склада: вторая строка — «{бренд} · {страна}»
 *     вместо «Для партии: …» (последнее остаётся фолбэком без каталожной меты).
 *  4. Ручные позиции («Своё») влиты в общий список по категории — отдельной
 *     секции для них больше нет (buildMergedRows).
 *  5. Пер-строчная иконка «На склад» убрана — единственный путь оприходования
 *     теперь галки «куплено» → «Пополнить склад (K)» в шапке.
 *
 * §3.3 «Почти хватает на:» здесь по-прежнему НЕ рендерится — черновик
 * посвящён списку покупок, эта секция в бою остаётся как есть.
 */
export function ShoppingLabView({ list }: { list: ShoppingListDto }) {
  const [selectedBrewId, setSelectedBrewId] = useState<string | null>(null);

  const allInStock = list.emptyReason === "all_in_stock";
  const showChips = list.plannedBrews.length > 1;

  const mergedRows = useMemo(
    () => buildMergedRows(list.groups, list.manualItems),
    [list.groups, list.manualItems]
  );

  const allDerivedLines = useMemo(() => list.groups.flatMap((group) => group.items), [list.groups]);

  // Режим конкретной варки: только производные строки (ручные позиции по
  // варкам не привязаны — скрыты), количество/фасовка — из ЕЁ собственной
  // записи neededBy, а не из общего агрегата строки.
  const brewRows = useMemo(() => {
    if (!selectedBrewId) {
      return [];
    }
    return allDerivedLines
      .map((line) => ({
        line,
        need: line.neededBy.find((entry) => entry.brewBatchId === selectedBrewId) ?? null
      }))
      .filter((entry): entry is { line: ShoppingListLineDto; need: ShoppingListLineDto["neededBy"][number] } => entry.need !== null)
      .sort((a, b) => a.line.ingredientDisplayName.localeCompare(b.line.ingredientDisplayName, "ru"));
  }, [allDerivedLines, selectedBrewId]);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-border bg-card p-4 shadow-sm sm:p-5">
        <ShoppingLabHeader groups={list.groups} manualItems={list.manualItems} checkedCount={list.checkedCount} />

        {showChips ? (
          <div className="mt-4">
            <BrewFilterChips plannedBrews={list.plannedBrews} selectedBrewId={selectedBrewId} onSelect={setSelectedBrewId} />
          </div>
        ) : null}

        <div className={showChips ? "mt-4 border-t border-border pt-4" : "mt-4"}>
          {selectedBrewId ? (
            brewRows.length > 0 ? (
              <ul className="divide-y divide-border">
                {brewRows.map(({ line, need }) => (
                  <ShoppingLabLineRow
                    key={line.key}
                    line={line}
                    quantityLabel={need.quantityLabel}
                    packSuggestion={need.packSuggestion}
                    showNeededByFallback={false}
                  />
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
                Для этой варки всё есть на складе.
              </p>
            )
          ) : mergedRows.length > 0 ? (
            <ul className="divide-y divide-border">
              {mergedRows.map((row) =>
                row.kind === "derived" ? (
                  <ShoppingLabLineRow
                    key={row.key}
                    line={row.line}
                    quantityLabel={row.line.quantityLabel}
                    packSuggestion={row.line.packSuggestion}
                  />
                ) : (
                  <ShoppingLabManualItemRow key={row.key} item={row.item} />
                )
              )}
            </ul>
          ) : allInStock ? (
            <p className="flex items-center gap-2 text-sm font-medium text-success">
              <CircleCheck className="h-4 w-4 shrink-0" aria-hidden />
              Всё нужное уже на складе.
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <PackageSearch className="h-4 w-4 shrink-0" aria-hidden />
              Пока пусто — запланируйте варку или добавьте позиции сами.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
