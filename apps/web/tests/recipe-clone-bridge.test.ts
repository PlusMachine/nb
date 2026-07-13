import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@nb/ui";

// RecipeSaveButton (внутри карточки/шапки) использует useRouter()/useToast() — нужны роутер и провайдер.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => undefined })
}));

import { defaultRecipeProcessMeta, type PublicRecipeListItem, type RecipeDetailDto } from "../features/recipes/contracts";
import { RecipeCloneAttribution } from "../components/recipes/recipe-clone-attribution";
import { CloneFromPublicButton } from "../components/recipes/clone-from-public-button";
import { PublicRecipeHeader } from "../components/recipes/public-recipe-header";
import { RecipeCard } from "../components/recipes/recipe-card";

const listItem: PublicRecipeListItem = {
  id: "r-1",
  slug: "west-coast-ipa",
  name: "West Coast IPA",
  author: { id: "author-1", displayName: "Сосед", image: null },
  style: null,
  og: 1.06,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  colorSrm: 9,
  colorEbc: 18,
  batchSizeL: 20,
  method: null,
  heroImage: null,
  styleImageUrl: null,
  cloneCount: 0,
  rating: null,
  featured: false,
  saveCount: 3,
  publishedAt: "2026-01-02T00:00:00.000Z",
  styleHref: null,
  createdAt: "2026-01-02T00:00:00.000Z"
};

const detail: RecipeDetailDto = {
  id: "r-1",
  authorId: "owner-1",
  recipeFamilyId: "rf-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "published",
  hiddenAt: null,
  hiddenReason: null,
  title: "West Coast IPA",
  slug: "west-coast-ipa",
  styleId: null,
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: 1.06,
  fg: 1.012,
  abv: 6.2,
  ibu: 45,
  color: 9,
  description: null,
  authorNotes: null,
  authorDisplayName: null,
  processMeta: defaultRecipeProcessMeta,
  heroImageId: null,
  rating: null,
  versions: [],
  completedBrewCount: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  ingredients: []
};

describe("clone bridge wiring", () => {
  it("shows the «Клонировать» button on the public recipe detail header", () => {
    const html = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(PublicRecipeHeader, { recipe: detail }))
    );
    expect(html).toContain("Клонировать");
  });

  it("shows a clone control on a saved-recipe card only when enabled", () => {
    const withClone = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(RecipeCard, { recipe: listItem, showCloneAction: true, preferredGravityUnit: "sg" }))
    );
    const withoutClone = renderToStaticMarkup(
      React.createElement(ToastProvider, null, React.createElement(RecipeCard, { recipe: listItem, preferredGravityUnit: "sg" }))
    );

    expect(withClone).toContain("Клонировать рецепт");
    expect(withoutClone).not.toContain("Клонировать рецепт");
  });

  it("renders the standalone clone button with its label", () => {
    const html = renderToStaticMarkup(
      React.createElement(CloneFromPublicButton, { recipeId: "r-1", slug: "west-coast-ipa", variant: "button" })
    );
    expect(html).toContain("Клонировать");
  });
});

describe("clone attribution banner", () => {
  const ownerAuthorId = "owner-1";

  it("links to the source when it is published and authored by someone else", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeCloneAttribution, {
        ownerAuthorId,
        clonedFrom: { id: "src-1", title: "Original IPA", slug: "original-ipa", authorId: "author-2", authorName: "Сосед", isPublished: true }
      })
    );

    expect(html).toContain("Адаптировано из");
    expect(html).toContain("Original IPA");
    expect(html).toContain("Сосед");
    expect(html).toContain("/recipes/original-ipa");
  });

  it("shows the source name without a link when the source is no longer published", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeCloneAttribution, {
        ownerAuthorId,
        clonedFrom: { id: "src-1", title: "Original IPA", slug: "original-ipa", authorId: "author-2", authorName: "Сосед", isPublished: false }
      })
    );

    expect(html).toContain("Original IPA");
    expect(html).not.toContain("/recipes/original-ipa");
  });

  it("renders nothing for an original recipe (no source)", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeCloneAttribution, { ownerAuthorId, clonedFrom: null })
    );
    expect(html).toBe("");
  });

  it("renders nothing when the clone source is the owner's own recipe", () => {
    const html = renderToStaticMarkup(
      React.createElement(RecipeCloneAttribution, {
        ownerAuthorId,
        clonedFrom: { id: "src-1", title: "My Other Recipe", slug: "mine", authorId: ownerAuthorId, authorName: "Я", isPublished: true }
      })
    );
    expect(html).toBe("");
  });
});
