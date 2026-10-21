export class RecipeImportError extends Error {
  constructor(readonly recipeIndex: number, readonly recipeTitle: string, readonly reason: unknown) {
    super(`IMPORT_RECIPE_ERROR: ${recipeIndex}: ${recipeTitle}: ${reason instanceof Error ? reason.message : "INVALID_BREWFATHER_JSON"}`);
  }
}

/** Shared by the preview and server actions so a failed collection is actionable. */
export const recipeImportErrorMessage = (error: unknown): string | null => {
  if (error instanceof RecipeImportError) {
    return `Рецепт ${error.recipeIndex} «${error.recipeTitle}»: ${recipeImportErrorMessage(error.reason) ?? "не удалось прочитать данные рецепта."} Ни один рецепт из файла не сохранён.`;
  }
  if (!(error instanceof Error)) return null;
  if (error.message.startsWith("UNSUPPORTED_IMPORT_UNIT:")) {
    return `Единица измерения не поддерживается: ${error.message.slice("UNSUPPORTED_IMPORT_UNIT:".length).trim()}. Укажите массу, объём или число упаковок в Brewfather и повторите экспорт.`;
  }
  switch (error.message) {
    case "IMPORT_TOO_MANY_RECIPES": return "За один раз можно импортировать до 100 рецептов. Разделите библиотеку на несколько файлов.";
    case "IMPORT_INPUT_TOO_LARGE": return "Файл превышает 8 МБ. Разделите библиотеку на несколько файлов.";
    case "INVALID_IMPORT_INGREDIENT_AMOUNT": return "У каждого ингредиента должно быть указано количество больше нуля.";
    case "INVALID_IMPORT_RECIPE": return "В рецепте не указано название.";
    case "IMPORT_RECIPE_EMPTY": return "В рецепте не найдены ингредиенты для импорта.";
    case "INVALID_BREWFATHER_JSON": return "Данные Brewfather не распознаны. Выберите JSON рецепта или резервную копию с разделом recipes.";
    default: return null;
  }
};
