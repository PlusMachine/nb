import { buildBjcpQueryVariants, foldBjcpSearchDiacritics, scoreBjcpSearchText } from "@nb/brewing-core";
import { getBjcpCatalogData } from "@nb/content";

import { buildRecipeStyleSearchIndex, findStyleByCode, type RecipeStyleSearchIndex } from "../style-search";

/**
 * Резолв стиля пива из импортируемого файла (Brewfather/BeerXML) в наш `styleId`
 * (= код BJCP, напр. "18B"). Парсеры складывают «подсказку» стиля в
 * `importMeta.styleHint`, а серверный импорт-экшен вызывает `resolveImportedStyleId`.
 *
 * Резолв асинхронный (нужен каталог BJCP из @nb/content), поэтому не встроен в
 * чистые синхронные парсеры — их результат используется и на клиенте для превью.
 */

export type ImportedStyleHint = {
  name?: string | null;
  categoryNumber?: string | null;
  styleLetter?: string | null;
};

/**
 * Порог уверенности для матча по названию. Точное совпадение полного названия
 * даёт 700 (RU-title) / 680 (EN-title); префикс — 520/500; токен — 320/300.
 * Берём только фактически полное совпадение имени, иначе рискуем уверенно
 * привязать не тот стиль (напр. Brewfather «New England IPA» ≠ 21B из BJCP 2021).
 */
const NAME_MATCH_THRESHOLD = 600;

export const readImportedStyleHint = (importMeta: unknown): ImportedStyleHint | null => {
  if (!importMeta || typeof importMeta !== "object") {
    return null;
  }
  const hint = (importMeta as Record<string, unknown>).styleHint;
  if (!hint || typeof hint !== "object") {
    return null;
  }
  const record = hint as Record<string, unknown>;
  const name = typeof record.name === "string" ? record.name : null;
  const categoryNumber = typeof record.categoryNumber === "string" ? record.categoryNumber : null;
  const styleLetter = typeof record.styleLetter === "string" ? record.styleLetter : null;
  if (!name && !categoryNumber) {
    return null;
  }
  return { name, categoryNumber, styleLetter };
};

const bestNameMatch = (index: RecipeStyleSearchIndex, name: string): { code: string | null; score: number } => {
  const variants = buildBjcpQueryVariants(foldBjcpSearchDiacritics(name));
  let bestCode: string | null = null;
  let bestScore = 0;
  for (const style of index.styles) {
    let score = 0;
    for (const variant of variants) {
      score = Math.max(score, scoreBjcpSearchText(style.titleEn, variant, 680, 500, 300));
      score = Math.max(score, scoreBjcpSearchText(style.title, variant, 700, 520, 320));
    }
    if (score > bestScore) {
      bestScore = score;
      bestCode = style.code;
    }
  }
  return { code: bestCode, score: bestScore };
};

export const resolveImportedStyleId = async (hint: ImportedStyleHint | null): Promise<string | null> => {
  if (!hint) {
    return null;
  }

  const index = buildRecipeStyleSearchIndex(await getBjcpCatalogData());

  // 1. Строгое совпадение по названию — устойчиво к расхождению буквенной
  //    нумерации между гайдами (у разных источников один стиль под разной буквой).
  if (hint.name?.trim()) {
    const { code, score } = bestNameMatch(index, hint.name.trim());
    if (code && score >= NAME_MATCH_THRESHOLD) {
      return code;
    }
  }

  // 2. Точный код categoryNumber+styleLetter (напр. "18B") — если такой есть в каталоге.
  const code = `${hint.categoryNumber ?? ""}${hint.styleLetter ?? ""}`.trim().toUpperCase();
  if (code) {
    const byCode = findStyleByCode(index, code);
    if (byCode) {
      return byCode.code;
    }
  }

  return null;
};
