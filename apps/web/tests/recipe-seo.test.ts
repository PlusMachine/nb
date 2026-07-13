import { describe, expect, it } from "vitest";
import type { BeerStyle } from "@nb/brewing-core";

import {
  defaultRecipeProcessMeta,
  type RecipeCloneSourceDto,
  type RecipeDetailDto,
  type RecipeIngredientDto,
  type PublicRecipeListItem
} from "../features/recipes/contracts";
import {
  buildPublicRecipeItemListJsonLd,
  buildPublicRecipeListMetadata,
  buildPublicRecipeMetadata,
  buildRecipeBreadcrumbJsonLd,
  buildRecipeJsonLd,
  isRecipeIndexable,
  RECIPE_INDEXABLE_MIN_DESCRIPTION_LENGTH
} from "../features/recipes/seo";

const buildIngredient = (overrides: Partial<RecipeIngredientDto> = {}): RecipeIngredientDto => ({
  id: "ri-1",
  recipeId: "r-1",
  persistentKey: "00000000-0000-4000-8000-000000000001",
  displayOrder: 0,
  ingredientCatalogItemId: "cat-1",
  userCustomIngredientId: null,
  type: "malt",
  ingredientCategory: "fermentable",
  // ingredientDisplayName в реальных рецептах — уже разрешённое (обычно RU)
  // имя со снимка каталога на момент сохранения рецепта (см. hydrateRecipeIngredientDto).
  ingredientDisplayName: "Пейл эль солод",
  amountEnteredQuantity: 4,
  amountEnteredUnit: "kg",
  amountNormalizedQuantity: 4000,
  amountNormalizedUnit: "g",
  stage: "mash",
  timeOffset: null,
  stepMeta: null,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  ...overrides
});

const buildRecipe = (overrides: Partial<RecipeDetailDto> = {}): RecipeDetailDto => ({
  id: "r-1",
  authorId: "u-1",
  recipeFamilyId: "rf-1",
  versionNumber: 1,
  versionCount: 1,
  publicationState: "published",
  hiddenAt: null,
  hiddenReason: null,
  title: "Hazy IPA",
  slug: "hazy-ipa",
  styleId: "21A",
  batchSizeEnteredQuantity: 20,
  batchSizeEnteredUnit: "l",
  batchSizeNormalizedQuantity: 20000,
  batchSizeNormalizedUnit: "ml",
  efficiency: 75,
  boilTimeMinutes: 60,
  og: 1.062,
  fg: 1.012,
  abv: 6.4,
  ibu: 42,
  color: 9.7,
  description: "Свободный текст автора — в meta description не используется",
  authorNotes: null,
  authorDisplayName: "Иван Пивовар",
  processMeta: defaultRecipeProcessMeta,
  heroImageId: null,
  rating: null,
  versions: [],
  completedBrewCount: 0,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-05T00:00:00.000Z"),
  ingredients: [
    buildIngredient(),
    buildIngredient({
      id: "ri-2",
      persistentKey: "00000000-0000-4000-8000-000000000002",
      type: "hop",
      ingredientCategory: "hop",
      ingredientDisplayName: "Цитра",
      amountEnteredQuantity: 50,
      amountEnteredUnit: "g",
      amountNormalizedQuantity: 50,
      amountNormalizedUnit: "g",
      stage: "boil",
      timeOffset: 15
    })
  ],
  ...overrides
});

const americanIpaStyle: BeerStyle = {
  id: "21A",
  bjcpId: "21A",
  styleKey: "21A",
  name: "American IPA",
  nameRu: "Американский IPA",
  family: "IPA, APA & Hoppy Styles",
  familyRu: "IPA, APA и хмелевые стили",
  og: null,
  fg: null,
  abv: null,
  ibu: null,
  colorSrm: null
};

describe("features/recipes/seo — публичная деталка рецепта", () => {
  it("buildPublicRecipeMetadata: title/canonical/description с фактами, OG-изображение при heroImageId", () => {
    const recipe = buildRecipe({ heroImageId: "img-42" });
    const metadata = buildPublicRecipeMetadata(recipe, americanIpaStyle);

    expect(metadata.title).toBe("Hazy IPA — рецепт Американский IPA");
    expect(metadata.alternates?.canonical).toBe("/recipes/hazy-ipa");
    expect(metadata.description).toContain("Рецепт Американский IPA");
    expect(metadata.description).toContain("ABV");
    expect(metadata.description).toContain("IBU 42");
    expect(metadata.description).toContain("20 л");
    expect(metadata.description).toContain("Солод: Пейл эль солод");
    expect(metadata.description).toContain("хмель: Цитра");
    expect(metadata.description).not.toContain("Свободный текст автора");
    expect(metadata.openGraph?.images).toEqual(["/api/recipe-images/img-42/large"]);
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("buildPublicRecipeMetadata: без стиля и без фото — title всё равно содержит «рецепт», OG без изображения", () => {
    const recipe = buildRecipe({ styleId: null, heroImageId: null });
    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.title).toBe("Hazy IPA — рецепт");
    expect(metadata.openGraph?.images).toBeUndefined();
    expect(metadata.twitter).toMatchObject({ card: "summary" });
  });

  it("buildPublicRecipeMetadata: описание обрезается по границе слова ~200 символов", () => {
    const longName = "Очень длинное название специального солода для проверки обрезки описания по границе слова";
    const recipe = buildRecipe({
      ingredients: [
        buildIngredient({ ingredientDisplayName: longName }),
        buildIngredient({
          id: "ri-2",
          persistentKey: "00000000-0000-4000-8000-000000000002",
          type: "hop",
          ingredientCategory: "hop",
          ingredientDisplayName: `${longName} хмель`
        })
      ]
    });

    const metadata = buildPublicRecipeMetadata(recipe, americanIpaStyle);

    expect((metadata.description as string).length).toBeLessThanOrEqual(200);
    expect(metadata.description).toContain("…");
    expect(metadata.description!.trimEnd().endsWith(" ")).toBe(false);
  });

  it("buildRecipeJsonLd: базовые поля Recipe, автор только при наличии имени, ингредиенты", () => {
    const recipe = buildRecipe({ heroImageId: "img-42" });
    const jsonLd = buildRecipeJsonLd(recipe, americanIpaStyle, { baseUrl: "http://localhost:3000" }) as Record<string, unknown>;

    expect(jsonLd["@type"]).toBe("Recipe");
    expect(jsonLd.name).toBe("Hazy IPA");
    expect(jsonLd.url).toBe("http://localhost:3000/recipes/hazy-ipa");
    expect(jsonLd.image).toBe("http://localhost:3000/api/recipe-images/img-42/large");
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Иван Пивовар" });
    expect(jsonLd.datePublished).toBe("2026-01-01T00:00:00.000Z");
    expect(jsonLd.dateModified).toBe("2026-01-05T00:00:00.000Z");
    expect(jsonLd.recipeCategory).toBe("Американский IPA");
    expect(jsonLd.recipeYield).toBe("20 л");
    expect(jsonLd.keywords).toBe("Американский IPA, IPA, APA и хмелевые стили");
    expect(jsonLd.recipeIngredient).toEqual(["4 кг Пейл эль солод", "50 г Цитра"]);
    expect(jsonLd.recipeInstructions).toBeUndefined();
    expect(jsonLd.nutrition).toBeUndefined();
  });

  it("buildRecipeJsonLd: без authorDisplayName — author отсутствует", () => {
    const recipe = buildRecipe({ authorDisplayName: null });
    const jsonLd = buildRecipeJsonLd(recipe, americanIpaStyle, { baseUrl: "http://localhost:3000" }) as Record<string, unknown>;

    expect(jsonLd.author).toBeUndefined();
  });

  it("buildRecipeJsonLd: aggregateRating только когда есть видимый рейтинг", () => {
    const withRating = buildRecipe({ rating: { average: 4.6, count: 8 } });
    const withoutRating = buildRecipe({ rating: null });

    const jsonLdWithRating = buildRecipeJsonLd(withRating, americanIpaStyle, { baseUrl: "http://localhost:3000" }) as Record<string, unknown>;
    const jsonLdWithoutRating = buildRecipeJsonLd(withoutRating, americanIpaStyle, { baseUrl: "http://localhost:3000" }) as Record<string, unknown>;

    expect(jsonLdWithRating.aggregateRating).toEqual({ "@type": "AggregateRating", ratingValue: 4.6, ratingCount: 8 });
    expect(jsonLdWithoutRating.aggregateRating).toBeUndefined();
  });

  it("buildRecipeBreadcrumbJsonLd: Главная → Рецепты → <название>, абсолютные URL", () => {
    const recipe = buildRecipe();
    const jsonLd = buildRecipeBreadcrumbJsonLd(recipe, { baseUrl: "http://localhost:3000" }) as {
      itemListElement: Array<{ position: number; name: string; item: string }>;
    };

    expect(jsonLd.itemListElement).toEqual([
      { "@type": "ListItem", position: 1, name: "Главная", item: "http://localhost:3000" },
      { "@type": "ListItem", position: 2, name: "Рецепты", item: "http://localhost:3000/recipes" },
      { "@type": "ListItem", position: 3, name: "Hazy IPA", item: "http://localhost:3000/recipes/hazy-ipa" }
    ]);
  });
});

describe("features/recipes/seo — витрина /recipes", () => {
  it("чистый ?page=N (N≥2) — self-canonical с page в URL и title", () => {
    const metadata = buildPublicRecipeListMetadata({ page: "2" });

    expect(metadata.alternates?.canonical).toBe("/recipes?page=2");
    expect(metadata.title).toBe("Рецепты сообщества — страница 2");
  });

  it("без параметров — canonical /recipes", () => {
    const metadata = buildPublicRecipeListMetadata({});

    expect(metadata.alternates?.canonical).toBe("/recipes");
    expect(metadata.title).toBe("Рецепты сообщества");
  });

  it("page=1 явно — canonical голый /recipes (не ?page=1)", () => {
    const metadata = buildPublicRecipeListMetadata({ page: "1" });

    expect(metadata.alternates?.canonical).toBe("/recipes");
  });

  it("page вместе с другим параметром (sort/фильтр) — canonical голый /recipes", () => {
    const metadata = buildPublicRecipeListMetadata({ page: "2", sort: "abv_desc" });

    expect(metadata.alternates?.canonical).toBe("/recipes");
  });

  it("свободный поиск/фильтр без page — canonical голый /recipes", () => {
    const metadata = buildPublicRecipeListMetadata({ q: "hazy" });

    expect(metadata.alternates?.canonical).toBe("/recipes");
  });

  const buildListItem = (overrides: Partial<PublicRecipeListItem> = {}): PublicRecipeListItem => ({
    id: "r-1",
    slug: "one",
    name: "One",
    author: { id: "u-1", displayName: "Иван Пивовар", image: null },
    style: null,
    styleHref: null,
    og: 1.05,
    fg: 1.012,
    abv: 5.5,
    ibu: 30,
    colorSrm: 8,
    colorEbc: 16,
    batchSizeL: 20,
    method: null,
    heroImage: null,
    styleImageUrl: null,
    cloneCount: 0,
    rating: null,
    featured: false,
    saveCount: 0,
    publishedAt: "2026-01-01T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  });

  it("buildPublicRecipeItemListJsonLd: позиции с учётом смещения по page, абсолютные URL", () => {
    const items: PublicRecipeListItem[] = [
      buildListItem({ slug: "one", name: "One" }),
      buildListItem({ id: "r-2", slug: "two", name: "Two" })
    ];

    const jsonLd = buildPublicRecipeItemListJsonLd(items, { baseUrl: "http://localhost:3000", offset: 24 }) as {
      itemListElement: Array<{ position: number; url: string; name: string }>;
    };

    expect(jsonLd.itemListElement).toEqual([
      { "@type": "ListItem", position: 25, url: "http://localhost:3000/recipes/one", name: "One" },
      { "@type": "ListItem", position: 26, url: "http://localhost:3000/recipes/two", name: "Two" }
    ]);
  });
});

describe("features/recipes/seo — isRecipeIndexable (порог качества UGC, §12 плейбука)", () => {
  it("ничего из четырёх сигналов нет — не индексируется", () => {
    expect(isRecipeIndexable({ description: null, heroImageId: null, ratingCount: 0, completedBrewCount: 0 })).toBe(false);
  });

  it("описание короче порога, без фото, оценок и варок — не индексируется", () => {
    expect(isRecipeIndexable({ description: "Коротко.", heroImageId: null, ratingCount: 0, completedBrewCount: 0 })).toBe(false);
  });

  it(`описание ровно ${RECIPE_INDEXABLE_MIN_DESCRIPTION_LENGTH - 1} символов — ниже порога`, () => {
    const description = "а".repeat(RECIPE_INDEXABLE_MIN_DESCRIPTION_LENGTH - 1);
    expect(isRecipeIndexable({ description, heroImageId: null, ratingCount: 0, completedBrewCount: 0 })).toBe(false);
  });

  it(`описание ровно ${RECIPE_INDEXABLE_MIN_DESCRIPTION_LENGTH} символов — уже индексируется`, () => {
    const description = "а".repeat(RECIPE_INDEXABLE_MIN_DESCRIPTION_LENGTH);
    expect(isRecipeIndexable({ description, heroImageId: null, ratingCount: 0, completedBrewCount: 0 })).toBe(true);
  });

  it("порог считается после trim (пробелы по краям не идут в счёт длины)", () => {
    const description = `  ${"а".repeat(RECIPE_INDEXABLE_MIN_DESCRIPTION_LENGTH)}  `;
    expect(isRecipeIndexable({ description, heroImageId: null, ratingCount: 0, completedBrewCount: 0 })).toBe(true);
  });

  it("есть heroImageId — индексируется даже без описания, оценок и варок", () => {
    expect(isRecipeIndexable({ description: null, heroImageId: "img-1", ratingCount: 0, completedBrewCount: 0 })).toBe(true);
  });

  it("есть хотя бы одна оценка — индексируется даже без описания, фото и варок", () => {
    expect(isRecipeIndexable({ description: null, heroImageId: null, ratingCount: 1, completedBrewCount: 0 })).toBe(true);
  });

  it("есть хотя бы одна подтверждённая варка — индексируется даже без описания, фото и оценок", () => {
    expect(isRecipeIndexable({ description: null, heroImageId: null, ratingCount: 0, completedBrewCount: 1 })).toBe(true);
  });

  it("0 варок и ничего больше — не индексируется", () => {
    expect(isRecipeIndexable({ description: null, heroImageId: null, ratingCount: 0, completedBrewCount: 0 })).toBe(false);
  });
});

describe("features/recipes/seo — buildPublicRecipeMetadata: noindex ниже порога качества (S1)", () => {
  it("бедный рецепт (короткое описание, без фото, без оценок) — robots noindex, canonical self", () => {
    const recipe = buildRecipe({ description: "Коротко.", heroImageId: null, rating: null });
    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.alternates?.canonical).toBe("/recipes/hazy-ipa");
  });

  it("качественный рецепт (есть фото) — без robots-блока", () => {
    const recipe = buildRecipe({ description: "Коротко.", heroImageId: "img-1", rating: null });
    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.robots).toBeUndefined();
  });

  it("качественный рецепт (есть оценка) — без robots-блока", () => {
    const recipe = buildRecipe({ description: "Коротко.", heroImageId: null, rating: { average: 4.5, count: 3 } });
    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.robots).toBeUndefined();
  });

  it("качественный рецепт (описание ≥150 символов) — без robots-блока", () => {
    const recipe = buildRecipe({
      description: "а".repeat(RECIPE_INDEXABLE_MIN_DESCRIPTION_LENGTH),
      heroImageId: null,
      rating: null
    });
    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.robots).toBeUndefined();
  });

  it("рецепт только с подтверждённой варкой (без описания/фото/оценок) — без robots-блока", () => {
    const recipe = buildRecipe({ description: "Коротко.", heroImageId: null, rating: null, completedBrewCount: 1 });
    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.robots).toBeUndefined();
  });

  it("0 варок и ничего больше — robots noindex", () => {
    const recipe = buildRecipe({ description: "Коротко.", heroImageId: null, rating: null, completedBrewCount: 0 });
    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});

describe("features/recipes/seo — buildPublicRecipeMetadata: canonical для клонов без переименования (S2)", () => {
  const buildCloneSource = (overrides: Partial<RecipeCloneSourceDto> = {}): RecipeCloneSourceDto => ({
    id: "r-source",
    title: "Hazy IPA",
    slug: "hazy-ipa-original",
    authorId: "u-2",
    authorName: "Автор источника",
    isPublished: true,
    ...overrides
  });

  it("клон без переименования, источник опубликован — canonical на источник, отдельный noindex не ставится", () => {
    const recipe = buildRecipe({
      title: "Hazy IPA",
      description: "Коротко.",
      heroImageId: null,
      rating: null,
      clonedFrom: buildCloneSource()
    });

    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.alternates?.canonical).toBe("/recipes/hazy-ipa-original");
    expect(metadata.robots).toBeUndefined();
  });

  it("переименованный клон — self-canonical; бедный по контенту → noindex как у обычного рецепта", () => {
    const recipe = buildRecipe({
      title: "Моя версия Hazy IPA",
      description: "Коротко.",
      heroImageId: null,
      rating: null,
      clonedFrom: buildCloneSource({ title: "Hazy IPA" })
    });

    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.alternates?.canonical).toBe("/recipes/hazy-ipa");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });

  it("клон без переименования, но источник не опубликован — self-canonical (не клеим на закрытый источник)", () => {
    const recipe = buildRecipe({
      title: "Hazy IPA",
      description: "Коротко.",
      heroImageId: null,
      rating: null,
      clonedFrom: buildCloneSource({ isPublished: false })
    });

    const metadata = buildPublicRecipeMetadata(recipe, null);

    expect(metadata.alternates?.canonical).toBe("/recipes/hazy-ipa");
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
