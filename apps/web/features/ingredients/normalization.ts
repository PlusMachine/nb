import {
  buildLayoutQueryVariants as buildSearchLayoutQueryVariants,
  buildSearchQueryVariants,
  normalizeSearchText as normalizeSearchTextEngine,
  swapKeyboardLayout as swapKeyboardLayoutEngine,
  transliterateLatToRu as transliterateLatToRuEngine,
  transliterateRuToLat as transliterateRuToLatEngine
} from "@nb/search";

const whitespaceRegex = /\s+/g;

export const canonicalIngredientFamilyGroups = [
  {
    key: "pilsner",
    terms: [
      "pil",
      "pils",
      "pilsen",
      "pilsner",
      "pilsener",
      "пилс",
      "пилснер",
      "пилсен",
      "пильзнер",
      "пильзен",
      "пильзенер",
      "пилзнер",
      "пильсен",
      "пилзен",
      "пилзенер"
    ]
  },
  {
    key: "pale_ale",
    terms: ["pale", "paleale", "pale ale", "пэйл", "пейл", "пэйл эль", "пейл эль"]
  },
  {
    key: "munich",
    terms: ["munich", "munchen", "munich malt", "мюнхен", "мюнхенский"]
  },
  {
    key: "vienna",
    terms: ["vienna", "vienna malt", "венский", "виенна"]
  },
  {
    key: "wheat",
    terms: ["wheat", "wheat malt", "пшеничный", "пшеничный солод"]
  },
  {
    key: "caramel",
    terms: ["cara", "caramel", "crystal", "карамельный", "карамельный солод"]
  },
  {
    key: "roasted",
    terms: ["roasted", "black", "chocolate", "black malt", "chocolate malt", "жженый", "шоколадный", "черный солод"]
  },
  {
    key: "acidulated",
    terms: ["acidulated", "acid malt", "sauer", "sauer malt", "кислый", "кислый солод"]
  }
] as const;

const tokenVariantGroups = canonicalIngredientFamilyGroups.map((group) => group.terms);

const tokenizeSearchTextPreservingRaw = (value: string) => value
  .normalize("NFKC")
  .replaceAll("ё", "е")
  .replace(/[.,;:!?()[\]{}"“”«»'`´]+/g, " ")
  .replace(/[-_/\\|]+/g, " ")
  .replace(whitespaceRegex, " ")
  .trim()
  .split(" ")
  .map((token) => token.trim())
  .filter(Boolean);

export const normalizeSearchText = (input: string) => normalizeSearchTextEngine(input);

export const normalizeIngredientName = normalizeSearchText;

export const dedupeSearchAliases = (aliases: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const alias of aliases) {
    if (typeof alias !== "string") {
      continue;
    }

    const cleaned = alias.replace(whitespaceRegex, " ").trim();
    const normalized = normalizeSearchText(cleaned);
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    out.push(cleaned);
  }

  return out;
};

export const normalizeAliasList = (aliases: string[]) => dedupeSearchAliases(aliases)
  .map((alias) => normalizeSearchText(alias));

export const transliterateRuToLat = (input: string) => transliterateRuToLatEngine(input);

export const transliterateLatToRu = (input: string) => transliterateLatToRuEngine(input);

export const swapKeyboardLayout = (input: string) => swapKeyboardLayoutEngine(input);

/**
 * Раскладка выключена по умолчанию — это фолбэк, а не первоклассный вариант
 * (см. ТЗ С1). Вызывающая сторона гоняет её вторым проходом только при нуле
 * результатов первого, см. {@link buildLayoutQueryVariants}.
 */
export const buildQueryVariants = (query: string, options: { includeLayoutVariants?: boolean } = {}) => (
  buildSearchQueryVariants(query, {
    tokenVariantGroups,
    includeLayoutVariants: options.includeLayoutVariants ?? false
  })
);

/** Раскладочный rescue-builder (см. buildBjcpLayoutQueryVariants в @nb/brewing-core) — только для двухпроходного фолбэка. */
export const buildLayoutQueryVariants = (query: string) => buildSearchLayoutQueryVariants(query, {
  tokenVariantGroups
});

const isCoveredByManufacturerPhrase = (queryVariant: string, manufacturerVariant: string) => {
  if (!queryVariant || !manufacturerVariant) {
    return false;
  }

  return queryVariant === manufacturerVariant
    || (queryVariant.length >= 2 && manufacturerVariant.startsWith(queryVariant))
    || (manufacturerVariant.length >= 2 && queryVariant.startsWith(manufacturerVariant));
};

const isManufacturerLikeToken = (token: string, manufacturerTokens: string[]) => {
  // Поведение сохраняется бит-в-бит: раскладка здесь всегда учитывается (не фолбэк) —
  // токен манифеста может быть набран в другой раскладке независимо от результата
  // основного поиска.
  const tokenVariants = buildQueryVariants(token, { includeLayoutVariants: true });

  return tokenVariants.some((tokenVariant) => manufacturerTokens.some((manufacturerToken) => (
    tokenVariant === manufacturerToken
    || (tokenVariant.length >= 2 && manufacturerToken.startsWith(tokenVariant))
    || (manufacturerToken.length >= 4 && tokenVariant.startsWith(manufacturerToken))
  )));
};

export const rewriteIngredientQueryForManufacturer = ({
  query,
  manufacturer
}: {
  query: string;
  manufacturer: string;
}) => {
  const normalizedManufacturer = normalizeSearchText(manufacturer);
  if (!normalizedManufacturer) {
    return query.trim();
  }

  const rawTokens = tokenizeSearchTextPreservingRaw(query);
  if (rawTokens.length === 0) {
    return "";
  }

  const queryVariants = buildQueryVariants(query, { includeLayoutVariants: true });
  const manufacturerVariants = buildQueryVariants(manufacturer, { includeLayoutVariants: true });

  if (queryVariants.some((queryVariant) => manufacturerVariants.some((manufacturerVariant) => (
    isCoveredByManufacturerPhrase(queryVariant, manufacturerVariant)
  )))) {
    return "";
  }

  const manufacturerTokens = [...new Set(
    manufacturerVariants.flatMap((variant) => variant.split(" ").filter(Boolean))
  )];

  return rawTokens
    .filter((token) => !isManufacturerLikeToken(token, manufacturerTokens))
    .join(" ");
};
