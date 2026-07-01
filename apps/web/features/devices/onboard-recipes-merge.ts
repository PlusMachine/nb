// =============================================================================
//  features/devices/onboard-recipes-merge.ts
//  Чистая merge-логика «слоты платы × привязки nb» (Phase 4). Вынесена из сервиса
//  без server-зависимостей (db/провайдер), чтобы тестироваться герметично.
//
//  Инвариант: занятость/имя слота — source of truth от УСТРОЙСТВА (listSlots);
//  привязка (boundRecipe*) — это последний nb-рецепт, который мы пушили в слот, и
//  может рассинхронизоваться с платой. recipeId=null при живой привязке = рецепт
//  удалён (ON DELETE SET NULL), но recipeName сохранён — показываем это честно.
// =============================================================================
import type { OnboardSlotDto } from "./onboard-recipes-contracts";

/** Слот, как его отдаёт устройство (listSlots): номер + имя, если занят. */
export type OnboardSlotSource = { slot: number; name: string | null };

/** Строка привязки слот↔рецепт nb (device_recipe_slots). */
export type OnboardSlotBinding = {
  slot: number;
  recipeId: string | null;
  recipeName: string | null;
  pushedAt: Date | null;
};

/** Смёржить слоты платы с привязками nb по номеру слота → OnboardSlotDto[]. */
export function mergeOnboardSlots(
  slots: OnboardSlotSource[],
  bindings: OnboardSlotBinding[]
): OnboardSlotDto[] {
  const bindingBySlot = new Map(bindings.map((b) => [b.slot, b]));
  return slots.map((s) => {
    const binding = bindingBySlot.get(s.slot);
    return {
      slot: s.slot,
      onboardName: s.name,
      occupied: s.name !== null,
      boundRecipeId: binding?.recipeId ?? null,
      boundRecipeName: binding?.recipeName ?? null,
      pushedAt: binding?.pushedAt ? binding.pushedAt.toISOString() : null
    };
  });
}
