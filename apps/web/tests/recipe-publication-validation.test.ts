import { describe, expect, it } from "vitest";

import {
  buildRecipePublicationChecklist,
  getRecipePublicationFieldErrors
} from "../features/recipes/publication-validation";

describe("recipe publication validation", () => {
  it("allows draft with only a title", () => {
    expect(getRecipePublicationFieldErrors({
      publicationState: "draft",
      title: "Новый рецепт 1",
      description: null,
      boilTimeMinutes: 60,
      ingredientCategories: []
    })).toEqual({});
  });

  it("allows private recipe with only a title", () => {
    expect(getRecipePublicationFieldErrors({
      publicationState: "private",
      title: "Private IPA",
      description: null,
      boilTimeMinutes: 60,
      ingredientCategories: []
    })).toEqual({});
  });

  it("requires description and core ingredients for published recipe", () => {
    expect(getRecipePublicationFieldErrors({
      publicationState: "published",
      title: "Public IPA",
      description: "",
      boilTimeMinutes: 60,
      ingredientCategories: ["fermentable", "hop"]
    })).toEqual({
      description: "Добавьте описание рецепта.",
      "ingredients.yeast": "Для публичного рецепта добавьте дрожжи.",
    });
  });

  it("allows publishing a recipe without a BJCP style (beer outside style)", () => {
    expect(getRecipePublicationFieldErrors({
      publicationState: "published",
      title: "Wild ale",
      description: "Эксперимент вне стиля",
      boilTimeMinutes: 60,
      ingredientCategories: ["fermentable", "hop", "yeast"]
    })).toEqual({});
  });

  it("builds readiness checklist with satisfied and missing publication requirements", () => {
    const checklist = buildRecipePublicationChecklist({
      publicationState: "published",
      title: "APA",
      description: "",
      boilTimeMinutes: 60,
      ingredientCategories: ["fermentable", "hop"]
    });

    expect(checklist.find((item) => item.key === "title")).toMatchObject({
      isSatisfied: true,
      statusLabel: "Готово"
    });
    expect(checklist.find((item) => item.key === "description")).toMatchObject({
      isSatisfied: false,
      statusLabel: "Не заполнено"
    });
    expect(checklist.find((item) => item.key === "ingredients.yeast")).toMatchObject({
      isSatisfied: false,
      statusLabel: "Не добавлено"
    });
  });
});
