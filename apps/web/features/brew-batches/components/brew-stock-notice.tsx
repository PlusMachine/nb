"use client";

// =============================================================================
//  features/brew-batches/components/brew-stock-notice.tsx
//  Честный фидбэк списания склада после единого входа «Сварить»
//  (brew-picker-dialog.tsx, виртуальная ветка): если пользователь включил
//  «Списать ингредиенты со склада», результат — успех или конкретная ошибка —
//  приезжает на страницу партии query-параметром `stock` (+ `items` при успехе,
//  + `consumeSubs=1`, если exact-only подбор не подставил сам все замены, см.
//  Ф2/brew-actions.ts), потому что сам server action не рендерит UI. Компонент
//  один раз показывает тост по этим параметрам и вычищает их из URL
//  (router.replace), чтобы обновление страницы (F5) не повторяло тост. Рендерит
//  null — вся работа в эффекте.
// =============================================================================
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@nb/ui";

const successText = (items: string | null): string =>
  `Списано со склада: ${items ?? "0"} поз.`;

// Списание одноразовое (hasConsumedAllocationsForBatch) — замену для остатка
// строк нельзя «доподтвердить» кнопкой на этой же странице: только «Вернуть на
// склад» и повторное списание в «Списать со склада» (там уже виден предпросмотр
// с заменами, Ф2).
const successWithSubstitutesText = (items: string | null): string =>
  `${successText(items)} Часть позиций не списана — на складе есть замены. Чтобы применить их, верните списание и спишите заново.`;

const nothingToConsumeWithSubstitutesText =
  "Точных совпадений на складе нет, но есть замены — подтвердите их в «Списать со склада».";

const errorTextByCode: Record<string, string> = {
  already_consumed: "Списание не выполнено: по этой партии ингредиенты уже списаны",
  insufficient_stock: "Списание не выполнено: не хватает остатков на складе",
  recipe_unavailable: "Списание не выполнено: рецепт-источник недоступен",
  nothing_to_consume: "Списывать нечего: ингредиентов рецепта нет на складе",
  error: "Списание не выполнено. Попробуйте со страницы партии."
};

export function BrewStockNotice() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { show } = useToast();

  const stock = searchParams.get("stock");

  useEffect(() => {
    if (!stock) {
      return;
    }

    const hasSubstitutes = searchParams.get("consumeSubs") === "1";

    if (stock === "consumed") {
      show({
        title: hasSubstitutes ? successWithSubstitutesText(searchParams.get("items")) : successText(searchParams.get("items")),
        tone: "success"
      });
    } else if (stock === "nothing_to_consume" && hasSubstitutes) {
      show({ title: nothingToConsumeWithSubstitutesText, tone: "warning" });
    } else {
      show({ title: errorTextByCode[stock] ?? errorTextByCode.error, tone: "danger" });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("stock");
    params.delete("items");
    params.delete("consumeSubs");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock]);

  return null;
}
