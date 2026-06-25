import type { IngredientCategory } from "../ingredients/contracts";
import type { RecipePublicationState } from "./contracts";

export type RecipePublicationRequirementKey =
  | "title"
  | "styleId"
  | "description"
  | "ingredients.fermentable"
  | "ingredients.hop"
  | "ingredients.yeast"
  | "boilTimeMinutes";

type RecipePublicationValidationInput = {
  publicationState: RecipePublicationState;
  title: string;
  styleId?: string | null;
  description?: string | null;
  boilTimeMinutes?: number | null;
  ingredientCategories: Array<IngredientCategory | null | undefined>;
};

export const publicationRequirementLabels: Record<RecipePublicationRequirementKey, string> = {
  title: "Название рецепта",
  styleId: "Стиль BJCP",
  description: "Описание рецепта",
  "ingredients.fermentable": "Хотя бы одно сбраживаемое",
  "ingredients.hop": "Хотя бы один хмель",
  "ingredients.yeast": "Хотя бы одни дрожжи",
  boilTimeMinutes: "Время кипячения"
};

export const publicationRequirementKeys: Record<RecipePublicationState, RecipePublicationRequirementKey[]> = {
  draft: ["title"],
  private: ["title"],
  published: [
    "title",
    "description",
    "ingredients.fermentable",
    "ingredients.hop",
    "ingredients.yeast",
    "boilTimeMinutes"
  ]
};

export const buildRecipePublicationChecklist = (
  input: RecipePublicationValidationInput
) => {
  const fieldErrors = getRecipePublicationFieldErrors(input);
  const requiredKeys = publicationRequirementKeys[input.publicationState];

  return requiredKeys.map((key) => ({
    key,
    label: publicationRequirementLabels[key],
    isSatisfied: !fieldErrors[key],
    statusLabel: !fieldErrors[key]
      ? "Готово"
      : key.startsWith("ingredients.")
        ? "Не добавлено"
        : "Не заполнено",
    message: fieldErrors[key] ?? null
  }));
};

export const getRecipePublicationFieldErrors = (
  input: RecipePublicationValidationInput
): Record<string, string> => {
  const fieldErrors: Record<string, string> = {};
  const hasFermentable = input.ingredientCategories.includes("fermentable");
  const hasHop = input.ingredientCategories.includes("hop");
  const hasYeast = input.ingredientCategories.includes("yeast");
  const hasDescription = Boolean(input.description?.trim());
  const hasBoilTime = Number.isInteger(input.boilTimeMinutes) && (input.boilTimeMinutes ?? 0) > 0;

  if (!input.title.trim()) {
    fieldErrors.title = "Укажите название рецепта.";
  }

  if (input.publicationState !== "published") {
    return fieldErrors;
  }

  if (!hasDescription) {
    fieldErrors.description = "Добавьте описание рецепта.";
  }

  if (!hasFermentable) {
    fieldErrors["ingredients.fermentable"] = "Добавьте хотя бы одно сбраживаемое.";
  }

  if (!hasHop) {
    fieldErrors["ingredients.hop"] = "Добавьте хотя бы один хмель.";
  }

  if (!hasYeast) {
    fieldErrors["ingredients.yeast"] = "Для публичного рецепта добавьте дрожжи.";
  }

  if (!hasBoilTime) {
    fieldErrors.boilTimeMinutes = "Укажите время кипячения.";
  }

  return fieldErrors;
};
