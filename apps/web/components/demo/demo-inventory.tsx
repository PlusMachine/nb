import { CircleAlert, CircleCheck } from "lucide-react";

import { DemoExhibit } from "@/components/demo/demo-exhibit";
import { GroupedInventoryList } from "@/components/inventory/grouped-inventory-list";
import type { InventoryListItemDto } from "@/features/inventory/contracts";
import type { SystemCurrency, SystemCurrencyRateMap } from "@/features/system/currency";

/**
 * Секция 2 «Склад» (docs/demo-page.md §2.2). Настоящий `GroupedInventoryList`
 * на фикстурных данных — интерактив (редактировать/списать/удалить) внутри
 * `InventoryListItem` дёргает server actions, а его диалоги порталятся в body,
 * поэтому список целиком глушится обёрткой DemoExhibit (inert: мышь, клавиатура
 * и фокус; компонент не имеет readOnly-пропа, патчить его нельзя — ловушки §5
 * спеки). Ниже — связка рецепт↔склад репликой `MatchRow` с главной
 * (apps/web/components/home/home-inventory.tsx).
 */

// Осознанное исключение из правила «бейдж готовности рендерит только
// BrewabilityBadgePill»: на главной title — короткое название рецепта, а детали
// нехватки несёт бейдж; здесь же весь факт («не хватает Citra 60 г», спека §2.2)
// сформулирован одной строкой, поэтому бейдж укорочен до статуса без числа —
// иначе он дублировал бы title. Тексты статичные, матча за ними нет; при
// переименовании бейджа сверяться с brewability-badge-pill.tsx.
function MatchRow({ title, ready }: { title: string; ready?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
      <span className="min-w-0 text-[13px] font-medium text-foreground">{title}</span>
      {ready ? (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-success-subtle px-2 py-0.5 text-xs font-medium text-success-subtle-foreground ring-1 ring-success/30">
          <CircleCheck className="h-3.5 w-3.5" aria-hidden />
          Хватает
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning-subtle-foreground ring-1 ring-warning/30">
          <CircleAlert className="h-3.5 w-3.5" aria-hidden />
          Не хватает
        </span>
      )}
    </div>
  );
}

export function DemoInventorySection({
  items,
  preferredCurrency,
  currencyRates
}: {
  items: InventoryListItemDto[];
  preferredCurrency: SystemCurrency;
  currencyRates: SystemCurrencyRateMap;
}) {
  return (
    <div className="space-y-5">
      {/* inert: клики, Tab-фокус и Enter по строкам вели бы на редактирование/
          списание через server actions — на публичной демо-странице недопустимо. */}
      <DemoExhibit>
        <GroupedInventoryList
          items={items}
          preferredCurrency={preferredCurrency}
          currencyRates={currencyRates}
          layout="grouped"
        />
      </DemoExhibit>

      <div className="space-y-2">
        <MatchRow title="American Stout — хватает всего, можно варить" ready />
        <MatchRow title="American IPA — не хватает Citra 60 г — уже в «Чего не хватает»" />
      </div>
    </div>
  );
}
