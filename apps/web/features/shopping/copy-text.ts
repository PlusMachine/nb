import type { ShoppingListGroupDto, ShoppingManualItemDto } from "./contracts";

// П3 «Скопировать список»: плоский текст для мессенджера/продавца — без ссылок,
// без markdown, без «Для партий». Копируются только НЕотмеченные строки
// (производные + ручные), группами в приходящем порядке (сервис уже строит
// group в порядке inventoryCategoryOrder — см. features/shopping/service.ts).
// Пустая группа (все строки отмечены) пропускается целиком — заголовок не
// выводится. Секция «Своё» — всегда последней, только если есть неотмеченные
// ручные позиции.
const COPY_TEXT_HEADER = "Список покупок — nb";
const MANUAL_ITEMS_GROUP_LABEL = "Своё";

export function buildShoppingListCopyText(input: {
  groups: Pick<ShoppingListGroupDto, "label" | "items">[];
  manualItems: ShoppingManualItemDto[];
}): string | null {
  const bodyLines: string[] = [];

  for (const group of input.groups) {
    const uncheckedItems = group.items.filter((item) => !item.checked);
    if (uncheckedItems.length === 0) {
      continue;
    }

    bodyLines.push(`${group.label}:`);
    for (const item of uncheckedItems) {
      bodyLines.push(
        item.packSuggestion
          ? `• ${item.ingredientDisplayName} — ${item.packSuggestion.label} (нужно ${item.quantityLabel})`
          : `• ${item.ingredientDisplayName} — ${item.quantityLabel}`
      );
    }
  }

  const uncheckedManualItems = input.manualItems.filter((item) => !item.checked);
  if (uncheckedManualItems.length > 0) {
    bodyLines.push(`${MANUAL_ITEMS_GROUP_LABEL}:`);
    for (const item of uncheckedManualItems) {
      bodyLines.push(item.quantityLabel ? `• ${item.name} — ${item.quantityLabel}` : `• ${item.name}`);
    }
  }

  if (bodyLines.length === 0) {
    return null;
  }

  return [COPY_TEXT_HEADER, ...bodyLines].join("\n");
}
