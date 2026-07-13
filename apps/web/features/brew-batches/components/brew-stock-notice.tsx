"use client";

// =============================================================================
//  features/brew-batches/components/brew-stock-notice.tsx
//  Честный фидбэк списания склада после единого входа «Сварить»
//  (brew-picker-dialog.tsx, виртуальная ветка): если пользователь включил
//  «Списать ингредиенты со склада», результат — успех или конкретная ошибка —
//  приезжает на страницу партии query-параметром `stock` (+ `items` при
//  успехе), потому что сам server action не рендерит UI. Компонент один раз
//  показывает тост по этим параметрам и вычищает их из URL (router.replace),
//  чтобы обновление страницы (F5) не повторяло тост. Рендерит null — вся
//  работа в эффекте.
// =============================================================================
import { useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useToast } from "@nb/ui";

const successText = (items: string | null): string =>
  `Списано со склада: ${items ?? "0"} поз.`;

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

    if (stock === "consumed") {
      show({ title: successText(searchParams.get("items")), tone: "success" });
    } else {
      show({ title: errorTextByCode[stock] ?? errorTextByCode.error, tone: "danger" });
    }

    const params = new URLSearchParams(searchParams.toString());
    params.delete("stock");
    params.delete("items");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stock]);

  return null;
}
