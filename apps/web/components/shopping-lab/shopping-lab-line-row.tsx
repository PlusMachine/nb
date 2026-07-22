"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { Checkbox } from "@nb/ui";

import { toggleShoppingLineCheckedAction } from "@/features/shopping/actions";
import type { ShoppingListLineDto } from "@/features/shopping/contracts";
import { categoryIconBg, categoryIcons } from "@/components/recipes/recipe-designer/helpers";

// Подпись «Для партии/партий: …» — фолбэк-контекст в режиме «Все варки»,
// когда у строки нет brand/countryName (нет каталожной привязки). В режиме
// конкретной варки эта подпись не нужна — чип уже проговорил, о какой варке
// речь (см. shopping-lab-view.tsx).
const resolveNeededByLabel = (neededBy: ShoppingListLineDto["neededBy"]) => {
  const names = [...new Set(neededBy.map((need) => need.brewName))];
  const shown = names.slice(0, 2).join(", ");
  const rest = names.length - Math.min(2, names.length);
  const prefix = names.length === 1 ? "Для партии" : "Для партий";
  return rest > 0 ? `${prefix}: ${shown} +${rest}` : `${prefix}: ${shown}`;
};

// «{бренд} · {страна}» — язык склада (см. features/inventory), а не «зачем
// покупаю». Пусто, если у строки нет ни бренда, ни страны (custom/name-only
// строки или каталожная запись без этих полей).
const resolveStockMetaLabel = (brand: string | null, countryName: string | null): string | null => {
  const parts = [brand, countryName].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
};

/**
 * v4 (лаборатория, /app/shopping-lab): строка списка покупок в языке склада.
 * Отличия от v3 (см. git-историю компонента):
 *  - иконка-ссылка «На склад» убрана целиком — единственный путь оприходования
 *    теперь галки «куплено» → «Пополнить склад (N)» в шапке (решение
 *    владельца, notes/shopping-list-improvements.md v4).
 *  - слева после чекбокса — иконка категории в кружке (та же палитра
 *    categoryIconBg/categoryIcons, что и у редактора рецептов) вместо
 *    текстового eyebrow-ярлыка группы — иконка несёт категорию на уровне
 *    строки, группа-обёртка больше не обязана её подписывать.
 *  - вторая строка — мета склада «{бренд} · {страна}» вместо «Для партии: …»;
 *    последнее остаётся фолбэком, когда меты нет (custom/name-only строки).
 *  - количество и его округление до фасовки принимаются пропсами
 *    (quantityLabel/packSuggestion) — view передаёт то общее, то per-brew
 *    значение, в зависимости от того, какой чип-варка выбран.
 */
export function ShoppingLabLineRow({
  line,
  quantityLabel,
  packSuggestion,
  showNeededByFallback = true
}: {
  line: ShoppingListLineDto;
  quantityLabel: string;
  packSuggestion: ShoppingListLineDto["packSuggestion"];
  showNeededByFallback?: boolean;
}) {
  const [checked, setChecked] = useState(line.checked);
  const [isPending, startTransition] = useTransition();

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

  const CategoryIcon = line.category ? categoryIcons[line.category] : Package;
  const iconBg = line.category ? categoryIconBg[line.category] : "bg-muted text-muted-foreground";

  const stockMetaLabel = resolveStockMetaLabel(line.brand, line.countryName);
  const secondaryLabel = stockMetaLabel ?? (showNeededByFallback ? resolveNeededByLabel(line.neededBy) : null);

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
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${iconBg}`} aria-hidden>
        <CategoryIcon className="h-3.5 w-3.5" />
      </span>
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
        {secondaryLabel ? <p className="mt-0.5 text-xs text-muted-foreground">{secondaryLabel}</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className="flex flex-col items-end">
          <span className="text-sm font-bold tabular-nums text-foreground">
            {packSuggestion ? packSuggestion.label : quantityLabel}
          </span>
          {packSuggestion ? (
            <span className="text-xs text-muted-foreground">нужно {quantityLabel}</span>
          ) : null}
        </span>
      </div>
    </li>
  );
}
