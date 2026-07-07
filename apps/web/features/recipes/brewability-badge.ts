import type { RecipeMatchDto } from "./contracts";

// Чистый резолвер бейджа «можно сварить» для карточек. Считает «силу» совпадения
// по ДОЛЕ присутствующих типов ингредиентов (а не по количественному
// matchPercent): «можно сварить» = есть хоть сколько-то каждого ингредиента
// (с учётом каскада брендов в движке), количество не строго. Не трогает движок —
// только интерпретирует уже посчитанные поля RecipeMatchDto. Клиент-безопасен.

export type BrewabilityTier = "ready" | "almost" | "hidden";

export type BrewabilityBadge = {
  tier: BrewabilityTier;
  missing: number;
  // Все типы есть, но где-то не хватает количества под партию.
  qtyShort: boolean;
};

// Бейдж «почти» показываем только когда в наличии ≥70% ТИПОВ ингредиентов —
// иначе совпадение слишком слабое (мусор), бейджа нет. Экспортируется, чтобы
// раздел «Чего не хватает» (§3.3, секция «Почти хватает на:») отбирал теми же порогами, не
// заводя вторую копию констант.
export const MIN_TYPE_COVERAGE = 0.7;

// …и не больше 2 ингредиентов до цели. «Почти» должно значить «осталось докупить
// 1-2 позиции»; «не хватает 4» на длинном рецепте — это не «почти», бейджа нет.
export const MAX_ALMOST_MISSING = 2;

export const resolveBrewabilityBadge = (
  dto: Pick<RecipeMatchDto, "totalLines" | "coveredLines" | "missingCount">
): BrewabilityBadge => {
  const { totalLines, coveredLines, missingCount } = dto;

  if (totalLines <= 0) {
    return { tier: "hidden", missing: 0, qtyShort: false };
  }

  if (missingCount === 0) {
    return { tier: "ready", missing: 0, qtyShort: coveredLines < totalLines };
  }

  const typeCoverage = (totalLines - missingCount) / totalLines;
  if (missingCount <= MAX_ALMOST_MISSING && typeCoverage >= MIN_TYPE_COVERAGE) {
    return { tier: "almost", missing: missingCount, qtyShort: false };
  }

  return { tier: "hidden", missing: missingCount, qtyShort: false };
};

// --- отбор для секции «Почти хватает на:» (раздел «Чего не хватает», §3.3) ---------
//
// Отдельная от resolveBrewabilityBadge функция: у раздела нехваток три яруса
// (развёрнуто/свёрнуто/не показываем), а не два (almost/hidden) — «не хватает
// 3+» там не прячется совсем, а уходит в свёрнутый список «Ещё K рецептов».
// Пороги те же (MIN_TYPE_COVERAGE, MAX_ALMOST_MISSING), чтобы «почти» на
// карточках и в разделе «Чего не хватает» значило одно и то же.

export type ShoppingOpportunityTier = "expanded" | "collapsed" | "hidden";

export const resolveShoppingOpportunityTier = (
  dto: Pick<RecipeMatchDto, "totalLines" | "missingCount">
): ShoppingOpportunityTier => {
  const { totalLines, missingCount } = dto;

  // ready (всё уже на складе) — рецепту нечего делать в этом разделе.
  if (totalLines <= 0 || missingCount === 0) {
    return "hidden";
  }

  const typeCoverage = (totalLines - missingCount) / totalLines;
  if (typeCoverage < MIN_TYPE_COVERAGE) {
    return "hidden";
  }

  return missingCount <= MAX_ALMOST_MISSING ? "expanded" : "collapsed";
};
