import { getBeerStyleById, getBeerStyleTaglineRu, getBjcpArticleHrefByStyleId } from "@nb/brewing-core";
import { listArticles } from "@nb/content";
import { db, eq, recipeImages, recipes, users } from "@nb/db";

import { isRecipeHidden, isRecipePubliclyVisible } from "../recipes/visibility";

import type { BeerPresentationDto } from "./contracts";
import { buildBeerShareKey, verifyBeerShareKey } from "./share-key";

// Доступ: published — открыто; draft/private — только владельцу или по
// share-ключу из QR (см. share-key.ts). Неудача любого вида — null без
// различения «нет рецепта» и «нет доступа», чтобы слаг черновика нельзя было
// подтвердить перебором.

export type GetBeerPresentationParams = {
  slug: string;
  shareKey?: string | null;
  viewerId?: string | null;
};

const splitParagraphs = (text: string): string[] =>
  text
    .split(/\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

export const getBeerPresentationBySlug = async (
  params: GetBeerPresentationParams
): Promise<BeerPresentationDto | null> => {
  const recipe = await db.query.recipes.findFirst({ where: eq(recipes.slug, params.slug) });
  if (!recipe) {
    return null;
  }

  // Скрытие модератором закрывает страницу пива целиком, включая владельца и
  // share-ключ из QR: иначе скрытое пиво осталось бы доступным по наклейке,
  // которая уже уехала на бутылках.
  if (isRecipeHidden(recipe)) {
    return null;
  }

  const isPublished = isRecipePubliclyVisible(recipe);
  const isOwner = params.viewerId != null && recipe.authorId === params.viewerId;
  if (!isPublished && !isOwner && !verifyBeerShareKey(recipe.id, params.shareKey)) {
    return null;
  }

  const author = await db.query.users.findFirst({
    where: eq(users.id, recipe.authorId),
    columns: { displayName: true, image: true }
  });

  const style = getBeerStyleById(recipe.styleId);
  const article = style
    ? (await listArticles()).find((item) => item.kind === "bjcp_style" && item.bjcpId === style.bjcpId) ?? null
    : null;

  const authorParagraphs = recipe.description ? splitParagraphs(recipe.description) : [];
  const styleText =
    article?.sections.find((section) => section.id === "overall_impression")?.content ??
    article?.description ??
    getBeerStyleTaglineRu(style?.id);
  const descriptionParagraphs = authorParagraphs.length > 0 ? authorParagraphs : styleText ? [styleText] : [];

  // Фото рецепта отдаёт /api/recipe-images с гейтом «published или владелец»;
  // гостю непубличного рецепта тот же share-ключ открывает и картинку.
  const heroImage = recipe.heroImageId
    ? await db.query.recipeImages.findFirst({
        where: eq(recipeImages.id, recipe.heroImageId),
        columns: { id: true, status: true }
      })
    : null;
  const heroPhotoUrl =
    heroImage && heroImage.status === "ready"
      ? `/api/recipe-images/${heroImage.id}/large${isPublished ? "" : `?k=${buildBeerShareKey(recipe.id)}`}`
      : null;

  return {
    slug: recipe.slug,
    title: recipe.title,
    style: style
      ? {
          code: style.bjcpId,
          name: style.nameRu ?? style.name,
          articleHref: getBjcpArticleHrefByStyleId(style.id)
        }
      : null,
    abv: recipe.abv,
    ibu: recipe.ibu,
    colorSrm: recipe.color,
    og: recipe.og,
    descriptionParagraphs,
    descriptionSource: authorParagraphs.length > 0 ? "author" : styleText ? "style" : null,
    author: {
      displayName: author?.displayName ?? null,
      image: author?.image ?? null
    },
    heroPhotoUrl,
    styleImageUrl: article?.heroImageUrl ?? null,
    isPublished
  };
};
