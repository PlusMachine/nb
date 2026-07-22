"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Plus } from "lucide-react";
import { Checkbox } from "@nb/ui";

import { toggleShoppingLineCheckedAction } from "@/features/shopping/actions";
import type { ShoppingListLineDto } from "@/features/shopping/contracts";

// Подпись «Для партии/партий: …» под именем строки — какие варки её ждут
// (контекст «зачем покупаю»). Перенесена сюда из shopping-list-view.tsx вместе
// со строкой, которую она подписывает.
const resolveNeededByLabel = (neededBy: ShoppingListLineDto["neededBy"]) => {
  const names = [...new Set(neededBy.map((need) => need.brewName))];
  const shown = names.slice(0, 2).join(", ");
  const rest = names.length - Math.min(2, names.length);
  const prefix = names.length === 1 ? "Для партии" : "Для партий";
  return rest > 0 ? `${prefix}: ${shown} +${rest}` : `${prefix}: ${shown}`;
};

/**
 * П2: строка производной нехватки §3.2 — чекбокс «куплено» слева · имя
 * (ссылка на каталог, если привязана) · подпись варок · количество · «На
 * склад». Отмеченная строка НЕ переезжает в списке (пользователь стоит в
 * магазине, прыжки под пальцем — зло) — только зачёркивается имя.
 *
 * Оптимистичное переключение — канон ingredient-favorite-toggle.tsx: локальный
 * стейт + rollback при !result.ok, без ожидания сервера (связь в магазине
 * плохая). Синхронизация с сервером — useEffect по line.checked (ревалидация
 * страницы после переноса на склад/отмены варки может поменять checked извне).
 */
export function ShoppingLineRow({ line }: { line: ShoppingListLineDto }) {
  const [checked, setChecked] = useState(line.checked);
  const [isPending, startTransition] = useTransition();

  // Пока свой тоггл в полёте, входящий line.checked может быть протухшим
  // снапшотом, принесённым ревалидацией из-за ДРУГОЙ строки — не даём ему
  // затереть оптимистичный стейт до завершения pending.
  useEffect(() => {
    if (isPending) {
      return;
    }
    setChecked(line.checked);
  }, [line.checked, isPending]);

  const handleToggle = (nextChecked: boolean) => {
    const previous = checked;
    setChecked(nextChecked);

    startTransition(async () => {
      const result = await toggleShoppingLineCheckedAction(line.key, nextChecked);
      if (!result.ok) {
        setChecked(previous);
      }
    });
  };

  return (
    <li className="flex items-start gap-3 py-2.5">
      <label className="relative -m-3 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center">
        <Checkbox
          checked={checked}
          disabled={isPending}
          onCheckedChange={handleToggle}
          aria-label={`Отметить купленным: ${line.ingredientDisplayName}`}
        />
      </label>
      <div className="min-w-0 flex-1">
        <p
          className={`text-[15px] font-medium leading-snug ${
            checked ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {line.catalogHref ? (
            <Link href={line.catalogHref} className="transition-colors hover:text-muted-foreground">
              {line.ingredientDisplayName}
            </Link>
          ) : (
            line.ingredientDisplayName
          )}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">{resolveNeededByLabel(line.neededBy)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex flex-col items-end">
          <span className="text-sm font-bold tabular-nums text-foreground">
            {line.packSuggestion ? line.packSuggestion.label : line.quantityLabel}
          </span>
          {/* П4: фасовка — основным числом, исходная нехватка — вторичной подписью. */}
          {line.packSuggestion ? (
            <span className="text-xs text-muted-foreground">нужно {line.quantityLabel}</span>
          ) : null}
        </span>
        {line.addToStockHref ? (
          <Link
            href={line.addToStockHref}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted"
          >
            <Plus className="h-3.5 w-3.5" />
            На склад
          </Link>
        ) : null}
      </div>
    </li>
  );
}
