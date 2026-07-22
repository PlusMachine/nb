import { Package } from "lucide-react";

import type { ShoppingManualItemDto } from "@/features/shopping/contracts";

import { GroupHeader } from "./group-header";
import { ManualItemForm } from "./manual-item-form";
import { ManualItemRow } from "./manual-item-row";

/**
 * П1: группа «Своё» блока «Добавить на склад» — ручные позиции, которых не
 * породит ни один рецепт (дезинфектант, кроненпробки, «Каскад про запас»).
 * Иконка/тон — как у «Прочее» (groupMeta.other): не разъезжается визуально
 * с категорийными группами. Кнопка/форма добавления — всегда внизу, даже
 * когда позиций пока нет (это единственный вход в добавление).
 */
export function ManualItemsGroup({ items }: { items: ShoppingManualItemDto[] }) {
  return (
    <section>
      {items.length > 0 ? (
        <>
          <GroupHeader
            icon={Package}
            iconColorClassName="text-muted-foreground"
            iconBgClassName="bg-muted"
            label="Своё"
            count={items.length}
          />
          <ul className="mt-1 divide-y divide-border">
            {items.map((item) => (
              <ManualItemRow key={item.id} item={item} />
            ))}
          </ul>
        </>
      ) : null}
      <div className={items.length > 0 ? "mt-2" : "mt-1.5"}>
        <ManualItemForm variant="listFooter" />
      </div>
    </section>
  );
}
