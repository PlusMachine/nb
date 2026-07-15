import type { DeviceTile } from "./contracts";

// =============================================================================
//  features/devices — return-recipe-core.ts
//  Чистое ядро ветки «Сварить → Подключить BrewForge → Продолжить варку» (Ф7,
//  сквозной UX-проход 2026-07-15): DevicePickerDialog уводит на /app/devices?
//  returnRecipe=<id>, страница устройств резолвит href и решает, готов ли
//  пользователь варить прямо сейчас. Вынесено отдельно от DB-обвязки
//  (return-recipe.ts) — колокированный тест идёт без БД (см. тот же приём в
//  fermenter-binding-core.ts/tile-snapshot.ts рядом).
// =============================================================================

/** Минимум полей рецепта, нужный резолву href — подмножество RecipeDetailDto. */
export type ReturnRecipeSource = {
  id: string;
  authorId: string;
  slug: string;
};

/**
 * Куда вести «Продолжить варку «<title>»»: свой рецепт — в редактор (там своя
 * автооткрывашка диалога «Сварить» по ?brew=1), чужой published — на публичную
 * страницу (её тоже открывает автооткрывашка). Клонировать рецепт при этом не
 * нужно — BrewPickerDialog и так варит любой доступный рецепт без копии.
 */
export const resolveReturnRecipeHref = (recipe: ReturnRecipeSource, viewerId: string): string =>
  recipe.authorId === viewerId
    ? `/app/recipes/${recipe.id}/edit?brew=1`
    : `/recipes/${recipe.slug}?brew=1`;

/**
 * «Может сварить прямо сейчас» для баннера «Продолжить варку» — DeviceTile не
 * несёт supportsRecipePush (в отличие от DeviceDto/PickerDevice), поэтому
 * допущение: online-плитка BrewForge способна варить. Демо-пивоварня создаётся
 * сразу в статусе online и попадает сюда так же, как реальный контроллер.
 */
export const hasBrewCapableOnlineTile = (tiles: readonly DeviceTile[]): boolean =>
  tiles.some((tile) => tile.kind === "brewforge" && tile.status === "online");
