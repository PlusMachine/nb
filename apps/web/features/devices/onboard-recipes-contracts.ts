// =============================================================================
//  features/devices/onboard-recipes-contracts.ts
//  Контракты «рецептов на борту» (Phase 4): что лежит в слотах устройства и
//  привязка слот↔исходный рецепт nb (device_recipe_slots). Только типы — файл
//  безопасно импортировать и в серверный сервис, и в клиентскую панель (никаких
//  server-only зависимостей: db/провайдер сюда не тянем).
// =============================================================================

/**
 * Слот устройства + привязка к рецепту nb. `onboardName` — имя рецепта, реально
 * лежащего на плате (source of truth из listSlots). Привязка (boundRecipe*) — это
 * ПОСЛЕДНИЙ nb-рецепт, который мы пушили в этот слот; она может рассинхронизоваться
 * с платой (кто-то перезаписал слот с пульта прошивки) — поэтому occupied берём с
 * платы, а привязку показываем как «источник», честно.
 */
export type OnboardSlotDto = {
  slot: number;
  /** Имя рецепта на плате (listSlots). null — слот пуст. */
  onboardName: string | null;
  /** Занят ли слот на плате (onboardName != null). */
  occupied: boolean;
  /** Исходный рецепт nb. null — привязки нет ИЛИ рецепт удалён (ON DELETE SET NULL). */
  boundRecipeId: string | null;
  /** Денормализованное имя на момент пуша (переживает удаление/переименование). */
  boundRecipeName: string | null;
  /** ISO времени последнего пуша nb-рецепта в слот, если было. */
  pushedAt: string | null;
};

/** Компактный рецепт пользователя для пикера «записать на плату». */
export type PushableRecipeDto = {
  id: string;
  title: string;
  versionNumber: number;
  og: number | null;
  abv: number | null;
};

/** Результат пуша рецепта nb на слот устройства. */
export type PushRecipeToSlotResult = {
  /** Слот, куда рецепт реально лёг (source of truth от устройства). */
  slot: number;
  boundRecipeId: string;
  boundRecipeName: string;
};
