import type { IngredientSuggestionItem } from "@/features/ingredients/contracts";

/**
 * Гейт уверенности для АВТОПРЕДВЫБОРА кандидата при пакетном сопоставлении
 * импорта. Проблема: поиск по каталогу почти всегда что-то возвращает (общий
 * токен/семейный фолбэк), и топ-1 бывает уверенно-неверным — напр. импортный
 * «Carapils» (декстриновый солод) матчится в «Cara Crystal» (карамельный) по
 * общему слову «Cara». Score/tier это не отделяют (оба tier 0).
 *
 * Решение: имена из Brewfather/BeerXML — латиница, и у каталожного кандидата
 * есть английское имя (nameEn) — тоже латиница. Предвыбираем кандидата, только
 * если МНОЖЕСТВО ТОКЕНОВ импортного имени является подмножеством токенов
 * английского имени кандидата (или наоборот) — т.е. одно имя целиком «внутри»
 * другого. Тогда:
 *   «Carapils» {carapils}      ⊄ «Cara Crystal» {cara, crystal}   → НЕ предвыбор
 *   «Vienna»   {vienna}         =  «Vienna» {vienna}               → предвыбор
 *   «Pale Ale Malt» {pale,ale,malt} ⊆ «BEST Pale Ale Malt»        → предвыбор
 * Неуверенные позиции показываем, но не автоприменяем (дефолт — «оставить
 * импортированным»): лучше лишний клик, чем молча подменить ингредиент.
 */

const STOP_TOKENS = new Set(["malt", "hops", "hop", "the", "and", "of"]);

export const tokenizeImportMatchName = (value: string | null | undefined): string[] => {
  if (!value) {
    return [];
  }
  // NFKD раскладывает диакритику на базовый символ + комбинирующий знак;
  // сначала снимаем комбинирующие знаки (чтобы «hüll» → «hull», а не «hu ll»),
  // затем `[^a-z0-9]` вычищает пунктуацию и нелатинские символы.
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
};

const isSubsetOrEqual = (a: string[], b: string[]): boolean => {
  if (!a.length) {
    return false;
  }
  const setB = new Set(b);
  return a.every((token) => setB.has(token));
};

const meaningful = (tokens: string[]) => tokens.filter((token) => !STOP_TOKENS.has(token));

/**
 * Совпадают ли имена «целиком» (одно — подмножество другого по токенам). Требуем
 * непустое пересечение по значимым токенам, чтобы «X Malt» и «Y Malt» не считались
 * совпадением по одному лишь общему «malt».
 */
const namesLineUp = (importedTokens: string[], candidateTokens: string[]): boolean => {
  if (!importedTokens.length || !candidateTokens.length) {
    return false;
  }
  const subset = isSubsetOrEqual(importedTokens, candidateTokens) || isSubsetOrEqual(candidateTokens, importedTokens);
  if (!subset) {
    return false;
  }
  // Пересечение по значимым (не стоп-словам) токенам должно быть непустым.
  const importantImported = meaningful(importedTokens);
  const setCandidate = new Set(candidateTokens);
  return importantImported.some((token) => setCandidate.has(token));
};

export const isConfidentImportMatch = (
  importedName: string | null | undefined,
  candidate: Pick<IngredientSuggestionItem, "nameEn" | "displayNameEn" | "displayName" | "nameRu"> | null | undefined
): boolean => {
  if (!candidate) {
    return false;
  }
  const importedTokens = tokenizeImportMatchName(importedName);
  if (!importedTokens.length) {
    return false;
  }
  // Имена из Brewfather/BeerXML — латиница; сравниваем только с ЛАТИНСКИМИ
  // полями кандидата. Кириллические поля пропускаем: их латинские огрызки
  // (римские «II», числа, куски бренда) дают ложные совпадения.
  const candidateNames = [candidate.nameEn, candidate.displayNameEn, candidate.displayName, candidate.nameRu]
    .filter((name): name is string => Boolean(name) && !/[Ѐ-ӿ]/i.test(name as string));
  return candidateNames.some((name) => namesLineUp(importedTokens, tokenizeImportMatchName(name)));
};
