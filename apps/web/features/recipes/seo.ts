import type { Metadata } from "next";
import type { BeerStyle } from "@nb/brewing-core";

import { resolveIngredientDisplayNames } from "../ingredients/presentation";
import { resolveIngredientCategory } from "../ingredients/taxonomy";
import { formatInventoryQuantityInputValue } from "../inventory/display";
import { formatInventoryUnitLabel } from "../inventory/units";
import { getSectionOgImage } from "../og/section";

import { getServerEnv } from "@/lib/env";

import type { PublicRecipeListItem, RecipeDetailDto, RecipeIngredientDto } from "./contracts";
import { formatAbvShort, formatBatchVolume, formatIbuShort } from "./format";

// SEO-фундамент публичной деталки/витрины рецептов (/recipes, /recipes/<slug>):
// metadata и JSON-LD (Recipe/BreadcrumbList/ItemList). Билдеры по образцу
// features/ingredients/seo.ts: jsonLdScriptProps переиспользуем оттуда,
// truncateAtWordBoundary там не экспортирован — держим локальный аналог (как
// в features/content-articles/seo.ts).

const DESCRIPTION_MAX_LENGTH = 200;

// Обрезает по границе слова, а не посередине — вместо ровно maxLength
// символов отдаёт чуть меньше, зато без разорванного слова перед «…».
const truncateAtWordBoundary = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
    return text;
  }

  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(" ");
  const safeCut = lastSpace > 0 ? truncated.slice(0, lastSpace) : truncated;
  return `${safeCut.trimEnd()}…`;
};

const isAbsoluteUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const resolveAbsoluteUrl = (baseUrl: string, path: string): string => (
  isAbsoluteUrl(path) ? path : `${baseUrl}${path}`
);

const resolveStyleName = (style: BeerStyle | null): string | null => (
  style ? style.nameRu ?? style.name : null
);

const resolveHeroImagePath = (heroImageId: string | null): string | null => (
  heroImageId ? `/api/recipe-images/${heroImageId}/large` : null
);

// --- UGC-гейтинг индексации (§12 SEO-плейбука: «публикация ≠ индексация») ----

// v1, настраивается владельцем: минимальная длина описания (после trim),
// которая сама по себе считается сигналом качества. Ниже порога рецепт
// попадает под noindex/вне sitemap, если нет и другого сигнала (фото/оценка).
export const RECIPE_INDEXABLE_MIN_DESCRIPTION_LENGTH = 150;

/**
 * Минимальный набор полей, нужный для решения об индексации рецепта. Отдельный
 * тип (не сам `RecipeDetailDto`), чтобы тот же критерий можно было применить
 * и к «тонкой» выборке sitemap (только нужные колонки, без тяжёлого маппинга
 * детальной страницы) — единственный источник истины для порога качества,
 * см. {@link isRecipeIndexable}.
 */
export type RecipeIndexabilityInput = {
  description: string | null;
  heroImageId: string | null;
  ratingCount: number;
  // Число подтверждённых (доведённых до конца, status="completed") варок этого
  // рецепта — любым пользователем, не только автором. Реально сваренный рецепт
  // сам по себе социальное доказательство качества, даже если автор не написал
  // описание и не залил фото.
  completedBrewCount: number;
};

/**
 * Порог качества UGC-рецепта (v1, §12 SEO-плейбука): индексируем, только если
 * есть хотя бы один сигнал качества — развёрнутое описание, фото, хотя бы одна
 * оценка или хотя бы одна подтверждённая варка. Ниже порога страница остаётся
 * доступной по прямой ссылке (публикация ≠ индексация), но получает `noindex`
 * и не попадает в sitemap — иначе массовый thin-content от одной кнопки
 * «Опубликовать» бьёт по хосту целиком (Яндекс МПК).
 */
export const isRecipeIndexable = (recipe: RecipeIndexabilityInput): boolean => {
  const hasSubstantialDescription = (recipe.description?.trim().length ?? 0) >= RECIPE_INDEXABLE_MIN_DESCRIPTION_LENGTH;
  const hasHeroImage = recipe.heroImageId != null;
  const hasRating = recipe.ratingCount > 0;
  const hasCompletedBrew = recipe.completedBrewCount > 0;
  return hasSubstantialDescription || hasHeroImage || hasRating || hasCompletedBrew;
};

/**
 * v1-эвристика «клон без существенных правок» (§12 SEO-плейбука, S2): если
 * пользователь скопировал чужой/свой опубликованный рецепт и не переименовал
 * копию — это сигнал «без существенных правок», а не самостоятельный контент.
 * Такой клон не получает собственную индексируемую страницу: canonical
 * указывает на источник вместо self (и он же исключается из sitemap — см.
 * `listRecipeSitemapEntries` в `./service.ts`, использующий этот же хелпер,
 * чтобы критерий не разъехался между двумя местами).
 * Переименованный клон — самостоятельная страница на общих основаниях (порог
 * качества/noindex как у любого рецепта).
 */
export const isUnmodifiedClone = (params: {
  cloneTitle: string;
  sourceTitle: string;
  sourceIsPublished: boolean;
}): boolean => params.sourceIsPublished && params.sourceTitle === params.cloneTitle;

/** Видимое название ингредиента (RU-первый) — тот же резолвер, что и на карточке рецепта. */
const resolveIngredientPrimaryName = (ingredient: RecipeIngredientDto): string => {
  const { primaryName } = resolveIngredientDisplayNames({
    displayName: ingredient.ingredientDisplayName ?? ingredient.ingredientDisplayNameSnapshot ?? ingredient.type,
    displayNameRu: ingredient.ingredientDisplayNameRu,
    displayNameEn: ingredient.ingredientDisplayNameEn
  });
  return primaryName;
};

const collectIngredientNamesByCategory = (
  ingredients: RecipeIngredientDto[],
  category: "fermentable" | "hop"
): string[] => {
  const names = new Set<string>();
  for (const ingredient of ingredients) {
    const resolvedCategory = ingredient.ingredientCategory ?? resolveIngredientCategory({ type: ingredient.type });
    if (resolvedCategory === category) {
      names.add(resolveIngredientPrimaryName(ingredient));
    }
  }
  return [...names];
};

/**
 * Фактологическое описание рецепта: «Рецепт <стиль>: ABV X %, IBU Y, объём Z л.
 * Солод: …; хмель: …» — только реальные поля рецепта, без выдуманных фраз.
 * Общий билдер для meta description и JSON-LD Recipe.description.
 */
const buildRecipeFactDescription = (recipe: RecipeDetailDto, style: BeerStyle | null): string => {
  const styleName = resolveStyleName(style);
  const intro = styleName ? `Рецепт ${styleName}` : "Рецепт";

  const facts = [
    recipe.abv != null ? `ABV ${formatAbvShort(recipe.abv)}` : null,
    recipe.ibu != null ? `IBU ${formatIbuShort(recipe.ibu)}` : null,
    recipe.batchSizeNormalizedUnit === "ml"
      ? `объём ${formatBatchVolume(recipe.batchSizeNormalizedQuantity / 1000)}`
      : null
  ].filter((fact): fact is string => Boolean(fact));

  let description = facts.length > 0 ? `${intro}: ${facts.join(", ")}.` : `${intro}.`;

  const maltNames = collectIngredientNamesByCategory(recipe.ingredients, "fermentable");
  const hopNames = collectIngredientNamesByCategory(recipe.ingredients, "hop");
  const ingredientClauses = [
    maltNames.length > 0 ? `Солод: ${maltNames.join(", ")}` : null,
    hopNames.length > 0 ? `хмель: ${hopNames.join(", ")}` : null
  ].filter((clause): clause is string => Boolean(clause));

  if (ingredientClauses.length > 0) {
    description = `${description} ${ingredientClauses.join("; ")}.`;
  }

  return truncateAtWordBoundary(description, DESCRIPTION_MAX_LENGTH);
};

export const buildPublicRecipeMetadata = (recipe: RecipeDetailDto, style: BeerStyle | null): Metadata => {
  const styleName = resolveStyleName(style);
  const title = styleName ? `${recipe.title} — рецепт ${styleName}` : `${recipe.title} — рецепт`;
  const description = buildRecipeFactDescription(recipe, style);
  // Всегда генерённая карточка (docs/specs/og-images.md §5.1, Ф5): своё фото
  // (heroImageId) больше не отдаётся сырым в og:image — оно встраивается
  // фото-врезкой внутрь той же брендовой карточки (см. features/og/photo.ts),
  // поэтому URL и 1200×630 одни для всех рецептов. Раньше ветвление на сырое
  // WebP-фото ловило строгих потребителей (WhatsApp/VK): произвольный аспект
  // портретных фото при жёстких 1200×630 врал размером — теперь эта дыра
  // закрыта самим фактом единой генерируемой карточки.
  const ogImage = { url: `/api/og/recipes/${recipe.slug}`, width: 1200, height: 630, alt: title };

  // S2: клон без существенных правок канонизируется на источник вместо себя —
  // см. isUnmodifiedClone выше.
  const cloneSource = recipe.clonedFrom;
  const isUnmodifiedCloneOfSource = cloneSource != null && isUnmodifiedClone({
    cloneTitle: recipe.title,
    sourceTitle: cloneSource.title,
    sourceIsPublished: cloneSource.isPublished
  });
  const canonicalPath = isUnmodifiedCloneOfSource ? `/recipes/${cloneSource.slug}` : `/recipes/${recipe.slug}`;

  // S1: ниже порога качества — noindex, follow (страница живёт по прямой
  // ссылке, но не в индексе). Клон, у которого canonical уже указывает на
  // источник, отдельный noindex не получает — canonical сам склеивает сигналы,
  // а двойной сигнал (canonical на другую страницу + noindex) только запутывает
  // роботов.
  const indexable = isRecipeIndexable({
    description: recipe.description,
    heroImageId: recipe.heroImageId,
    ratingCount: recipe.rating?.count ?? 0,
    completedBrewCount: recipe.completedBrewCount
  });
  const robots = !indexable && !isUnmodifiedCloneOfSource ? { index: false, follow: true } : undefined;

  return {
    title,
    description,
    alternates: {
      canonical: canonicalPath
    },
    ...(robots ? { robots } : {}),
    openGraph: {
      type: "article",
      url: canonicalPath,
      title,
      description,
      images: [ogImage]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url]
    }
  };
};

export const buildRecipeJsonLd = (
  recipe: RecipeDetailDto,
  style: BeerStyle | null,
  params: { baseUrl: string }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");
  const url = `${base}/recipes/${recipe.slug}`;
  const heroImagePath = resolveHeroImagePath(recipe.heroImageId);
  const styleName = resolveStyleName(style);

  const recipeIngredient = recipe.ingredients.map((ingredient) => {
    const amount = formatInventoryQuantityInputValue(ingredient.amountEnteredQuantity, ingredient.amountEnteredUnit);
    const unitLabel = formatInventoryUnitLabel(ingredient.amountEnteredUnit, ingredient.amountEnteredQuantity) ?? ingredient.amountEnteredUnit;
    const name = resolveIngredientPrimaryName(ingredient);
    return `${amount} ${unitLabel} ${name}`.trim();
  });

  const payload: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Recipe",
    name: recipe.title,
    url,
    description: buildRecipeFactDescription(recipe, style),
    datePublished: recipe.createdAt.toISOString(),
    dateModified: recipe.updatedAt.toISOString()
  };

  if (heroImagePath) {
    payload.image = resolveAbsoluteUrl(base, heroImagePath);
  }

  // author — только когда есть реальное имя (users.displayName может быть не
  // заполнено); выдумывать «Автор NB» не нужно.
  if (recipe.authorDisplayName) {
    payload.author = {
      "@type": "Person",
      name: recipe.authorDisplayName
    };
  }

  if (recipeIngredient.length > 0) {
    payload.recipeIngredient = recipeIngredient;
  }

  if (styleName) {
    payload.recipeCategory = styleName;
  }

  if (recipe.batchSizeNormalizedUnit === "ml") {
    payload.recipeYield = formatBatchVolume(recipe.batchSizeNormalizedQuantity / 1000);
  }

  const keywords = [styleName, style?.familyRu ?? style?.family ?? null].filter(
    (value): value is string => Boolean(value)
  );
  if (keywords.length > 0) {
    payload.keywords = keywords.join(", ");
  }

  // aggregateRating — только видимый на странице рейтинг (recipe.rating); внутренний
  // байесовский ratingBayes (используется для сортировки «По рейтингу») сюда не идёт.
  if (recipe.rating) {
    payload.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: recipe.rating.average,
      ratingCount: recipe.rating.count
    };
  }

  // recipeInstructions НЕ добавляем: шаги варки на публичной странице не
  // рендерятся (только затирание/брожение, если заданы), а brew-steps к тому же
  // хранятся на английском — размечаем только видимый контент.
  // nutrition (калории/порция) НЕ добавляем: на странице не показывается; если
  // понадобится — считать через calculateCaloriesPerServing из @nb/brewing-core.

  return payload;
};

export const buildRecipeBreadcrumbJsonLd = (
  recipe: Pick<RecipeDetailDto, "title" | "slug">,
  params: { baseUrl: string }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Главная", item: base || "/" },
      { "@type": "ListItem", position: 2, name: "Рецепты", item: `${base}/recipes` },
      { "@type": "ListItem", position: 3, name: recipe.title, item: `${base}/recipes/${recipe.slug}` }
    ]
  };
};

// --- Витрина /recipes --------------------------------------------------------

const RECIPES_LIST_TITLE = "Рецепты сообщества";
const RECIPES_LIST_DESCRIPTION =
  "Готовые рецепты от домашних пивоваров — выберите идею под свой стиль и оборудование. Фильтры по стилю, цвету, крепости и горечи.";

// "recipes" — ключ реестра обложек разделов (features/og/section.ts,
// SECTION_HUBS.recipes), типизирован SectionOgKey — getSectionOgImage
// резолвит его без null. Цикла с og/section.ts здесь нет (в отличие от
// features/ingredients/seo.ts) — модуль можно дёрнуть на module scope.
const RECIPES_LIST_OG_IMAGE = getSectionOgImage("recipes");

export type PublicRecipeListRawSearchParams = Record<string, string | string[] | undefined>;

const hasNonEmptyValue = (value: string | string[] | undefined): boolean => {
  if (Array.isArray(value)) {
    return value.some((entry) => entry.trim() !== "");
  }
  return typeof value === "string" && value.trim() !== "";
};

/**
 * Canonical/title витрины `/recipes`. Чистый `?page=N` (N ≥ 2, без других
 * параметров) получает self-canonical `/recipes?page=N`; любой другой параметр
 * (фильтр, sort, view, либо page=1) канонизируется на голый `/recipes` — чтобы
 * не плодить дубли отфильтрованных выборок в индексе.
 */
export const buildPublicRecipeListMetadata = (rawSearchParams: PublicRecipeListRawSearchParams): Metadata => {
  const presentKeys = Object.keys(rawSearchParams).filter((key) => hasNonEmptyValue(rawSearchParams[key]));
  const isPageOnly = presentKeys.length === 1 && presentKeys[0] === "page";
  const rawPage = isPageOnly ? rawSearchParams.page : undefined;
  const pageValue = Array.isArray(rawPage) ? rawPage[0] : rawPage;
  const pageNumber = pageValue != null ? Number(pageValue) : NaN;
  const page = isPageOnly && Number.isInteger(pageNumber) && pageNumber >= 2 ? pageNumber : null;

  const title = page ? `${RECIPES_LIST_TITLE} — страница ${page}` : RECIPES_LIST_TITLE;
  const canonicalPath = page ? `/recipes?page=${page}` : "/recipes";

  // Страница ЗАМЕЩАЕТ openGraph родительского layout целиком (не мёржится) —
  // locale/siteName повторяем сами (см. app/(public)/page.tsx).
  const { SITE_NAME } = getServerEnv();

  return {
    title,
    description: RECIPES_LIST_DESCRIPTION,
    alternates: {
      canonical: canonicalPath
    },
    openGraph: {
      title,
      description: RECIPES_LIST_DESCRIPTION,
      type: "website",
      locale: "ru_RU",
      siteName: SITE_NAME,
      images: [RECIPES_LIST_OG_IMAGE]
    },
    twitter: {
      // Брендовая обложка /recipes подключена (Ф3, docs/specs/og-images.md
      // §5.8) → summary_large_image, как у остальных страниц с картинкой.
      card: "summary_large_image",
      title,
      description: RECIPES_LIST_DESCRIPTION,
      images: [RECIPES_LIST_OG_IMAGE.url]
    }
  };
};

/** ItemList текущей страницы витрины — позиции с учётом смещения по `page`. */
export const buildPublicRecipeItemListJsonLd = (
  items: PublicRecipeListItem[],
  params: { baseUrl: string; offset: number }
): object => {
  const base = params.baseUrl.replace(/\/$/, "");

  const itemListElement = items.map((item, index) => ({
    "@type": "ListItem",
    position: params.offset + index + 1,
    url: `${base}/recipes/${item.slug}`,
    name: item.name
  }));

  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement
  };
};
