import {
  buildQueryVariants,
  canonicalIngredientFamilyGroups,
  normalizeSearchText,
  swapKeyboardLayout
} from "./normalization";
import { buildConsumablePackageSearchLabels } from "./consumables";

type MatchType = "name" | "alias" | "code" | "package" | "brand" | "token";
type SearchScript = "cyrillic" | "latin" | "mixed" | "neutral";
type MatchKind = "exact" | "prefix" | "token_start" | "all_tokens" | "contains";
type QueryIntent = "generic_family" | "family_context" | "code_specific" | "default";

type RankedCandidateAlias =
  | string
  | {
    alias?: string | null;
    aliasNormalized?: string | null;
    normalized?: string | null;
    source?: string | null;
    isEnabled?: boolean;
  };

type RankedCandidatePackageVariant = {
  id?: string | null;
  name?: string | null;
  productName?: string | null;
  productNameEn?: string | null;
  productNameRu?: string | null;
  normalizedName?: string | null;
  brand?: string | null;
  packageAmount?: number | null;
  packageUnit?: string | null;
  stockContentAmount?: number | null;
  stockContentUnit?: string | null;
};

export type RankedCandidate = {
  category?: string | null;
  sourceCategory?: string | null;
  displayName?: string;
  displayNameRu?: string | null;
  displayNameEn?: string | null;
  nameRu?: string | null;
  nameEn?: string | null;
  normalizedName?: string;
  aliases?: RankedCandidateAlias[];
  displayNameNorm?: string;
  searchAliasesNorm?: string[];
  searchTextNorm?: string;
  brandName?: string | null;
  manufacturer?: string | null;
  productCode?: string | null;
  packageVariants?: RankedCandidatePackageVariant[];
  isFavorite?: boolean;
  source?: "catalog" | "custom";
  inventoryUsageCount?: number;
  recipeUsageCount?: number;
  brandMarketCount?: number;
  sourcesCount?: number;
  packageVariantsCount?: number;
};

export type IngredientCandidateRank = {
  tier: number;
  score: number;
  matchType: MatchType;
  matchedAlias?: string | null;
  matchedPackageVariantId?: string | null;
  matchedPackageVariantName?: string | null;
  // Совпадение только по семейству запроса «семейство + уточнение»
  // («курский пилс» → все пилснеры), контекст-токены («курский») не совпали
  // полностью ни с брендом, ни с полями продукта. Пикеру такой фолбэк нужен
  // (подбор замен), каталог режет его, когда есть точные совпадения — см.
  // filterRankedFamilyFallback в catalog-ranking.ts.
  familyFallback?: boolean;
};

type NormalizedEntry = {
  value: string;
  normalized: string;
};

type AliasSourceKind = "default" | "market_name" | "priority_term";

type AliasEntry = NormalizedEntry & {
  sourceKind: AliasSourceKind;
};

type PackageFieldEntry = NormalizedEntry & {
  variantId?: string | null;
  variantName?: string | null;
};

type TextMatch = {
  detail: number;
  kind: MatchKind;
};

type NamedFamily = {
  key: string;
  terms: string[];
  termSet: Set<string>;
};

type QueryVariants = {
  base: string;
  queryScript: SearchScript;
  allVariants: string[];
  sameScriptVariants: string[];
  sameScriptFamilyVariants: string[];
  crossScriptVariants: string[];
};

type QueryAnalysis = QueryVariants & {
  tokens: string[];
  family: NamedFamily | null;
  familyVariants: string[];
  contextTokens: string[];
  codeTokens: string[];
  intent: QueryIntent;
};

type FamilyRoute = {
  route: "primary" | "package" | "canonical_alias" | "support_alias";
  quality: number;
  sameScript: boolean;
  modifierCount: number;
  extraTokens: string[];
  matchedAlias?: string | null;
  matchedPackageVariantId?: string | null;
  matchedPackageVariantName?: string | null;
  matchType: MatchType;
};

type CodeMatch = {
  strength: number;
  matchType: MatchType;
  matchedPackageVariantId?: string | null;
  matchedPackageVariantName?: string | null;
};

type NormalizedCandidate = {
  nameEntries: NormalizedEntry[];
  aliasEntries: AliasEntry[];
  marketAliasEntries: AliasEntry[];
  priorityAliasEntries: AliasEntry[];
  packageFieldEntries: PackageFieldEntry[];
  brandEntries: NormalizedEntry[];
  productCodeEntry: NormalizedEntry | null;
  productSearchTextNorm: string;
  brandSearchTextNorm: string;
  searchTextNorm: string;
};

const cyrillicRegex = /[а-я]/;
const latinRegex = /[a-z]/;
const neutralFamilyCompanionTokens = new Set([
  "malt",
  "malted",
  "солод"
]);
const packageUnitTokens = new Set([
  "g", "kg", "mg", "ml", "l", "oz", "lb", "gal", "pack", "item", "шт", "г", "кг", "мг", "мл", "л"
]);

const namedFamilies: NamedFamily[] = canonicalIngredientFamilyGroups.map((group) => ({
  key: group.key,
  terms: [...group.terms],
  termSet: new Set(group.terms)
}));

const levenshtein = (left: string, right: string) => {
  const rows = Array.from({ length: left.length + 1 }, (_, rowIndex) => (
    Array.from({ length: right.length + 1 }, (_, columnIndex) => (
      rowIndex === 0 ? columnIndex : columnIndex === 0 ? rowIndex : 0
    ))
  ));

  for (let row = 1; row <= left.length; row += 1) {
    for (let column = 1; column <= right.length; column += 1) {
      rows[row][column] = Math.min(
        rows[row - 1][column] + 1,
        rows[row][column - 1] + 1,
        rows[row - 1][column - 1] + (left[row - 1] === right[column - 1] ? 0 : 1)
      );
    }
  }

  return rows[left.length][right.length];
};

const tokenize = (value: string) => value.split(" ").filter(Boolean);

const hasAllTokens = (variant: string, haystack: string) => {
  const tokens = tokenize(variant);
  return tokens.length > 0 && tokens.every((token) => haystack.includes(token));
};

const calcFuzzyBonus = (variant: string, targets: string[]) => {
  if (variant.length < 5 || targets.length === 0) {
    return 0;
  }

  const distance = Math.min(...targets.map((target) => levenshtein(variant, target)));
  if (distance > 2) {
    return 0;
  }

  return Math.max(0, 50 - distance * 18);
};

const fieldContainsToken = (fields: string[], token: string) => fields.some((field) => field.includes(token));

const hasDistributedTokenMatch = ({
  tokens,
  primaryFields,
  secondaryFields
}: {
  tokens: string[];
  primaryFields: string[];
  secondaryFields: string[];
}) => {
  if (tokens.length < 2 || primaryFields.length === 0 || secondaryFields.length === 0) {
    return false;
  }

  const allFields = [...primaryFields, ...secondaryFields];

  return tokens.every((token) => fieldContainsToken(allFields, token))
    && tokens.some((token) => fieldContainsToken(primaryFields, token))
    && tokens.some((token) => fieldContainsToken(secondaryFields, token));
};

const detectSearchScript = (value: string): SearchScript => {
  const hasCyrillic = cyrillicRegex.test(value);
  const hasLatin = latinRegex.test(value);

  if (hasCyrillic && hasLatin) {
    return "mixed";
  }

  if (hasCyrillic) {
    return "cyrillic";
  }

  if (hasLatin) {
    return "latin";
  }

  return "neutral";
};

const matchesQueryScript = (value: string, queryScript: SearchScript) => {
  if (queryScript === "cyrillic") {
    return cyrillicRegex.test(value);
  }

  if (queryScript === "latin") {
    return latinRegex.test(value);
  }

  return true;
};

const isCrossScriptField = (value: string, queryScript: SearchScript) => (
  (queryScript === "cyrillic" || queryScript === "latin")
  && !matchesQueryScript(value, queryScript)
);

const buildScore = (tier: number, detail: number) => (100 - tier) * 1000 + detail;

const buildEntry = (value: string | null | undefined): NormalizedEntry | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const normalized = normalizeSearchText(trimmed);
  if (!trimmed || !normalized) {
    return null;
  }

  return {
    value: trimmed,
    normalized
  };
};

const dedupeEntries = <T extends { normalized: string }>(entries: T[]) => {
  const deduped = new Map<string, T>();

  for (const entry of entries) {
    if (!entry.normalized || deduped.has(entry.normalized)) {
      continue;
    }

    deduped.set(entry.normalized, entry);
  }

  return [...deduped.values()];
};

const resolveAliasSourceKind = (source?: string | null): AliasSourceKind => {
  const normalized = normalizeSearchText(source ?? "");
  if (normalized.includes("priority term")) {
    return "priority_term";
  }

  if (normalized.includes("market name")) {
    return "market_name";
  }

  return "default";
};

const aliasSourceKindWeight: Record<AliasSourceKind, number> = {
  default: 0,
  market_name: 1,
  priority_term: 2
};

const buildAliasEntries = (candidate: RankedCandidate) => {
  const deduped = new Map<string, AliasEntry>();
  const assign = (entry: AliasEntry | null) => {
    if (!entry?.normalized) {
      return;
    }

    const current = deduped.get(entry.normalized);
    if (!current || aliasSourceKindWeight[entry.sourceKind] > aliasSourceKindWeight[current.sourceKind]) {
      deduped.set(entry.normalized, entry);
    }
  };

  (candidate.aliases ?? []).forEach((alias, index) => {
    if (typeof alias === "string") {
      const normalized = candidate.searchAliasesNorm?.[index] ?? normalizeSearchText(alias);
      assign(normalized ? {
        value: alias,
        normalized,
        sourceKind: "default"
      } : null);
      return;
    }

    if (alias.isEnabled === false) {
      return;
    }

    const value = alias.alias?.trim() ?? "";
    const normalized = alias.aliasNormalized?.trim()
      || alias.normalized?.trim()
      || normalizeSearchText(value);

    assign(value && normalized ? {
      value,
      normalized,
      sourceKind: resolveAliasSourceKind(alias.source)
    } : null);
  });

  (candidate.searchAliasesNorm ?? []).forEach((normalized) => {
    assign(normalized ? {
      value: normalized,
      normalized,
      sourceKind: "default"
    } : null);
  });

  return [...deduped.values()];
};

const buildPackageFieldEntries = (candidate: RankedCandidate) => {
  const entries: PackageFieldEntry[] = [];

  for (const variant of candidate.packageVariants ?? []) {
    const productName = variant.productName ?? variant.productNameEn ?? variant.productNameRu ?? null;
    const variantName = variant.name?.trim()
      || [variant.brand, productName].filter(Boolean).join(" ").trim()
      || null;
    const normalizedName = variant.normalizedName?.trim()
      || normalizeSearchText([variant.brand, productName].filter(Boolean).join(" "));

    for (const value of [
      productName,
      variant.productNameEn,
      variant.productNameRu,
      variantName,
      variant.brand,
      ...buildConsumablePackageSearchLabels({
        brand: variant.brand ?? null,
        productNameEn: variant.productNameEn ?? null,
        productNameRu: variant.productNameRu ?? null,
        packageAmount: variant.packageAmount ?? null,
        packageUnit: variant.packageUnit ?? null,
        stockContentAmount: variant.stockContentAmount ?? null,
        stockContentUnit: variant.stockContentUnit ?? null
      })
    ]) {
      const entry = buildEntry(value);
      if (!entry) {
        continue;
      }

      entries.push({
        ...entry,
        variantId: variant.id ?? null,
        variantName
      });
    }

    if (normalizedName) {
      entries.push({
        value: variantName ?? normalizedName,
        normalized: normalizedName,
        variantId: variant.id ?? null,
        variantName
      });
    }
  }

  return dedupeEntries(entries);
};

const normalizeCandidate = (candidate: RankedCandidate): NormalizedCandidate => {
  const nameEntries = dedupeEntries([
    buildEntry(candidate.displayName),
    buildEntry(candidate.displayNameRu),
    buildEntry(candidate.nameRu),
    buildEntry(candidate.displayNameEn),
    buildEntry(candidate.nameEn)
  ].filter((entry): entry is NormalizedEntry => entry !== null));

  const aliasEntries = buildAliasEntries(candidate);
  const marketAliasEntries = aliasEntries.filter((entry) => entry.sourceKind === "market_name");
  const priorityAliasEntries = aliasEntries.filter((entry) => entry.sourceKind === "priority_term");
  const packageFieldEntries = buildPackageFieldEntries(candidate);
  const brandEntries = dedupeEntries([
    buildEntry(candidate.brandName),
    buildEntry(candidate.manufacturer)
  ].filter((entry): entry is NormalizedEntry => entry !== null));
  const productCodeEntry = buildEntry(candidate.productCode);
  const productSearchTextNorm = normalizeSearchText([
    ...nameEntries.map((entry) => entry.normalized),
    ...aliasEntries.map((entry) => entry.normalized),
    ...packageFieldEntries.map((entry) => entry.normalized),
    productCodeEntry?.normalized ?? ""
  ].join(" "));
  const brandSearchTextNorm = normalizeSearchText(brandEntries.map((entry) => entry.normalized).join(" "));
  const searchTextNorm = candidate.searchTextNorm
    ?? normalizeSearchText([
      productSearchTextNorm,
      brandSearchTextNorm,
      candidate.normalizedName ?? ""
    ].join(" "));

  return {
    nameEntries,
    aliasEntries,
    marketAliasEntries,
    priorityAliasEntries,
    packageFieldEntries,
    brandEntries,
    productCodeEntry,
    productSearchTextNorm,
    brandSearchTextNorm,
    searchTextNorm
  };
};

const isConsumableCandidate = (candidate: RankedCandidate) => candidate.category === "consumable";

const isPackageLikeQuery = (queryInfo: QueryAnalysis) => (
  queryInfo.tokens.some((token) => /\d/.test(token) || packageUnitTokens.has(token))
);

const scoreTextMatch = (
  field: string,
  variants: string[],
  options: { allowSubstring?: boolean } = {}
): TextMatch | null => {
  const fieldTokens = tokenize(field);
  let best: TextMatch | null = null;

  const assign = (detail: number, kind: MatchKind) => {
    if (!best || detail > best.detail) {
      best = {
        detail,
        kind
      };
    }
  };

  for (const variant of variants) {
    if (!variant) {
      continue;
    }

    const variantTokens = tokenize(variant);
    const variantBonus = Math.min(60, variant.length * 4);
    const closenessPenalty = Math.min(140, Math.max(0, field.length - variant.length) * 4);

    if (field === variant) {
      assign(960 + variantBonus, "exact");
      continue;
    }

    if (field.startsWith(variant)) {
      assign(890 + variantBonus - closenessPenalty, "prefix");
      continue;
    }

    if (fieldTokens.some((token) => token.startsWith(variant))) {
      assign(850 + variantBonus - closenessPenalty, "token_start");
      continue;
    }

    if (variantTokens.length > 1 && variantTokens.every((token) => field.includes(token))) {
      assign(790 + variantBonus - closenessPenalty, "all_tokens");
      continue;
    }

    if (options.allowSubstring && variant.length >= 4 && field.includes(variant)) {
      assign(730 + variantBonus - closenessPenalty, "contains");
    }
  }

  return best;
};

type RankingOptions = {
  /** Раскладка — фолбэк: включается только вторым проходом при нуле результатов первого. */
  includeLayoutVariants?: boolean;
};

const resolveQueryVariants = (query: string, options: RankingOptions = {}): QueryVariants | null => {
  const base = normalizeSearchText(query);
  if (!base) {
    return null;
  }

  const allVariants = buildQueryVariants(query, { includeLayoutVariants: options.includeLayoutVariants });
  if (!allVariants.length) {
    return null;
  }

  const queryScript = detectSearchScript(base);
  const sameScriptVariants = (queryScript === "cyrillic" || queryScript === "latin")
    ? allVariants.filter((variant) => matchesQueryScript(variant, queryScript))
    : [base];
  const sameScriptFamilyVariants = sameScriptVariants.filter((variant) => variant !== base);
  const crossScriptVariants = allVariants.filter((variant) => !sameScriptVariants.includes(variant));

  return {
    base,
    queryScript,
    allVariants,
    sameScriptVariants,
    sameScriptFamilyVariants,
    crossScriptVariants
  };
};

const familyMatchesToken = (token: string, family: NamedFamily) => (
  family.termSet.has(token)
  || (token.length >= 3 && family.terms.some((term) => term.startsWith(token)))
  || family.terms.some((term) => term.length >= 4 && token.startsWith(term))
);

const resolveCanonicalFamily = (tokens: string[], variants: string[]) => {
  let bestFamily: NamedFamily | null = null;
  let bestScore = 0;

  for (const family of namedFamilies) {
    let score = 0;

    for (const token of tokens) {
      if (family.termSet.has(token)) {
        score += 5;
      } else if (familyMatchesToken(token, family)) {
        score += 3;
      }
    }

    for (const variant of variants) {
      if (family.termSet.has(variant)) {
        score += 4;
      } else if (familyMatchesToken(variant, family)) {
        score += 2;
      }
    }

    if (score > bestScore) {
      bestFamily = family;
      bestScore = score;
    }
  }

  return bestFamily;
};

const isCodeLikeToken = (token: string) => (
  token.length >= 2
  && token.length <= 8
  && /^[a-z0-9]+$/i.test(token)
  && /\d/.test(token)
);

const analyzeQuery = (query: string, options: RankingOptions = {}): QueryAnalysis | null => {
  const variants = resolveQueryVariants(query, options);
  if (!variants) {
    return null;
  }

  const tokens = tokenize(variants.base);
  const family = resolveCanonicalFamily(tokens, variants.allVariants);
  const codeTokens = tokens.filter(isCodeLikeToken);
  const contextTokens = family
    ? tokens.filter((token) => !familyMatchesToken(token, family) && !codeTokens.includes(token))
    : tokens.filter((token) => !codeTokens.includes(token));

  let intent: QueryIntent = "default";
  if (family && contextTokens.length === 0 && codeTokens.length === 0) {
    intent = "generic_family";
  } else if (
    codeTokens.length > 0
    && (
      tokens.length === codeTokens.length
      || (tokens.length === 1 && codeTokens.length === 1)
    )
  ) {
    intent = "code_specific";
  } else if (family) {
    intent = "family_context";
  }

  return {
    ...variants,
    tokens,
    family,
    familyVariants: family
      ? variants.allVariants.filter((variant) => familyMatchesToken(variant, family))
      : [],
    contextTokens,
    codeTokens,
    intent
  };
};

const countMatchedTokensInEntries = (tokens: string[], entries: NormalizedEntry[]) => {
  if (tokens.length === 0 || entries.length === 0) {
    return 0;
  }

  const uniqueTokens = [...new Set(tokens)];

  return uniqueTokens.filter((token) => entries.some((entry) => (
    tokenize(entry.normalized).some((entryToken) => (
      entryToken === token
      || entryToken.startsWith(token)
      || (entryToken.length >= 4 && token.startsWith(entryToken))
    ))
  ))).length;
};

const extractFamilyDetails = (value: string, family: NamedFamily) => {
  const tokens = tokenize(value);
  const familyTokens = tokens.filter((token) => family.termSet.has(token));
  const extraTokens = tokens.filter((token) => (
    !family.termSet.has(token)
    && !isCodeLikeToken(token)
    && !neutralFamilyCompanionTokens.has(token)
  ));

  return {
    familyTokens,
    extraTokens
  };
};

const resolveFamilyRoute = (
  queryInfo: QueryAnalysis,
  normalizedCandidate: NormalizedCandidate
): FamilyRoute | null => {
  if (!queryInfo.family) {
    return null;
  }

  const familyVariants = queryInfo.familyVariants.length > 0
    ? queryInfo.familyVariants
    : [queryInfo.base];
  let best: FamilyRoute | null = null;

  const assign = (candidate: FamilyRoute) => {
    if (!best || candidate.quality > best.quality) {
      best = candidate;
    }
  };

  normalizedCandidate.nameEntries.forEach((entry) => {
    const details = extractFamilyDetails(entry.normalized, queryInfo.family as NamedFamily);
    const textMatch = scoreTextMatch(entry.normalized, familyVariants, { allowSubstring: true });
    if (details.familyTokens.length === 0 && !textMatch) {
      return;
    }

    const quality = 130
      + (textMatch?.detail ?? 0) / 18
      + Math.min(details.familyTokens.length, 2) * 8
      - Math.min(details.extraTokens.length, 3) * 2
      + (matchesQueryScript(entry.normalized, queryInfo.queryScript) ? 2 : 0);

    assign({
      route: "primary",
      quality,
      sameScript: matchesQueryScript(entry.normalized, queryInfo.queryScript),
      modifierCount: details.extraTokens.length,
      extraTokens: details.extraTokens,
      matchType: "name"
    });
  });

  normalizedCandidate.packageFieldEntries.forEach((entry) => {
    const details = extractFamilyDetails(entry.normalized, queryInfo.family as NamedFamily);
    const textMatch = scoreTextMatch(entry.normalized, familyVariants, { allowSubstring: true });
    if (details.familyTokens.length === 0 && !textMatch) {
      return;
    }

    const quality = 122
      + (textMatch?.detail ?? 0) / 20
      + Math.min(details.familyTokens.length, 2) * 7
      - Math.min(details.extraTokens.length, 3) * 2
      + (matchesQueryScript(entry.normalized, queryInfo.queryScript) ? 2 : 0);

    assign({
      route: "package",
      quality,
      sameScript: matchesQueryScript(entry.normalized, queryInfo.queryScript),
      modifierCount: details.extraTokens.length,
      extraTokens: details.extraTokens,
      matchedPackageVariantId: entry.variantId ?? null,
      matchedPackageVariantName: entry.variantName ?? entry.value,
      matchType: "package"
    });
  });

  normalizedCandidate.aliasEntries.forEach((entry) => {
    const details = extractFamilyDetails(entry.normalized, queryInfo.family as NamedFamily);
    const textMatch = scoreTextMatch(entry.normalized, familyVariants, { allowSubstring: true });
    if (!textMatch && details.familyTokens.length === 0) {
      return;
    }

    const isCanonicalEquivalent = details.familyTokens.length > 0;
    const isPureCanonical = isCanonicalEquivalent && details.extraTokens.length === 0;
    const quality = (isPureCanonical ? 118 : isCanonicalEquivalent ? 108 : 96)
      + (textMatch?.detail ?? 0) / 22
      + (matchesQueryScript(entry.normalized, queryInfo.queryScript) ? 2 : 0)
      - Math.min(details.extraTokens.length, 3) * (isCanonicalEquivalent ? 2 : 4);

    assign({
      route: isPureCanonical ? "canonical_alias" : "support_alias",
      quality,
      sameScript: matchesQueryScript(entry.normalized, queryInfo.queryScript),
      modifierCount: details.extraTokens.length,
      extraTokens: details.extraTokens,
      matchedAlias: entry.value,
      matchType: "alias"
    });
  });

  return best;
};

const resolveCodeMatch = (
  queryInfo: QueryAnalysis,
  normalizedCandidate: NormalizedCandidate
): CodeMatch | null => {
  const codeTokens = queryInfo.codeTokens.length > 0
    ? queryInfo.codeTokens
    : (queryInfo.intent === "code_specific" ? [queryInfo.base] : []);
  if (codeTokens.length === 0) {
    return null;
  }

  let best: CodeMatch | null = null;

  const assign = (candidate: CodeMatch) => {
    if (!best || candidate.strength > best.strength) {
      best = candidate;
    }
  };

  const productCode = normalizedCandidate.productCodeEntry?.normalized ?? "";
  codeTokens.forEach((token) => {
    if (productCode && productCode === token) {
      assign({ strength: 140, matchType: "code" });
    } else if (productCode && productCode.startsWith(token)) {
      assign({ strength: 128, matchType: "code" });
    }

    normalizedCandidate.packageFieldEntries.forEach((entry) => {
      const tokens = tokenize(entry.normalized);
      if (tokens.includes(token)) {
        assign({
          strength: 136,
          matchType: "package",
          matchedPackageVariantId: entry.variantId ?? null,
          matchedPackageVariantName: entry.variantName ?? entry.value
        });
      } else if (tokens.some((entryToken) => entryToken.startsWith(token))) {
        assign({
          strength: 124,
          matchType: "package",
          matchedPackageVariantId: entry.variantId ?? null,
          matchedPackageVariantName: entry.variantName ?? entry.value
        });
      }
    });

    normalizedCandidate.nameEntries.forEach((entry) => {
      const tokens = tokenize(entry.normalized);
      if (tokens.includes(token)) {
        assign({ strength: 132, matchType: "name" });
      } else if (tokens.some((entryToken) => entryToken.startsWith(token))) {
        assign({ strength: 120, matchType: "name" });
      }
    });
  });

  return best;
};

const computePopularityBoost = (
  queryInfo: QueryAnalysis,
  candidate: RankedCandidate
) => {
  const usageBoost = Math.min(
    (candidate.inventoryUsageCount ?? 0) * 4
    + (candidate.recipeUsageCount ?? 0) * 5,
    24
  );
  const brandBoost = Math.min(Math.max(0, (candidate.brandMarketCount ?? 0) - 1) * 3, 12);
  const richnessBoost = Math.min(
    (candidate.sourcesCount ?? 0) * 2
    + (candidate.packageVariantsCount ?? 0) * 2,
    10
  );
  const raw = usageBoost + brandBoost + richnessBoost;

  if (queryInfo.intent === "generic_family") {
    return raw;
  }

  if (queryInfo.intent === "family_context") {
    return Math.round(raw * 0.7);
  }

  return Math.round(raw * 0.5);
};

const computeFavoriteBoost = (
  queryInfo: QueryAnalysis,
  candidate: RankedCandidate
) => {
  if (!candidate.isFavorite) {
    return 0;
  }

  if (queryInfo.intent === "generic_family") {
    return 18;
  }

  if (queryInfo.intent === "family_context") {
    return 12;
  }

  return 6;
};

const buildIntentAwareRank = (
  queryInfo: QueryAnalysis,
  candidate: RankedCandidate,
  normalizedCandidate: NormalizedCandidate
): IngredientCandidateRank | null => {
  const familyRoute = resolveFamilyRoute(queryInfo, normalizedCandidate);
  const codeMatch = resolveCodeMatch(queryInfo, normalizedCandidate);
  const brandTokenMatches = countMatchedTokensInEntries(queryInfo.contextTokens, normalizedCandidate.brandEntries);
  const productTokenMatches = countMatchedTokensInEntries(queryInfo.contextTokens, [
    ...normalizedCandidate.nameEntries,
    ...normalizedCandidate.aliasEntries,
    ...normalizedCandidate.packageFieldEntries
  ]);
  const favoriteBoost = computeFavoriteBoost(queryInfo, candidate);
  const popularityBoost = computePopularityBoost(queryInfo, candidate);

  if (queryInfo.intent === "generic_family") {
    if (familyRoute && familyRoute.route !== "support_alias") {
      const detail = 820
        + familyRoute.quality
        + favoriteBoost
        + popularityBoost
        + (familyRoute.route === "primary" ? 8 : familyRoute.route === "canonical_alias" ? 6 : 4)
        + (familyRoute.sameScript ? 2 : 0)
        - Math.min(familyRoute.modifierCount, 3) * 2;

      return {
        tier: 0,
        score: buildScore(0, detail),
        matchType: familyRoute.matchType,
        matchedAlias: familyRoute.matchedAlias,
        matchedPackageVariantId: familyRoute.matchedPackageVariantId,
        matchedPackageVariantName: familyRoute.matchedPackageVariantName
      };
    }

    if (familyRoute && familyRoute.route === "support_alias") {
      const detail = 720
        + familyRoute.quality
        + Math.round(favoriteBoost * 0.7)
        + Math.round(popularityBoost * 0.7);

      return {
        tier: 1,
        score: buildScore(1, detail),
        matchType: "alias",
        matchedAlias: familyRoute.matchedAlias
      };
    }

    if (codeMatch) {
      return {
        tier: 2,
        score: buildScore(2, 700 + codeMatch.strength + popularityBoost),
        matchType: codeMatch.matchType,
        matchedPackageVariantId: codeMatch.matchedPackageVariantId,
        matchedPackageVariantName: codeMatch.matchedPackageVariantName
      };
    }
  }

  if (queryInfo.intent === "family_context") {
    const hasCompleteBrandMatch = queryInfo.contextTokens.length > 0 && brandTokenMatches === queryInfo.contextTokens.length;
    const hasCompleteModifierMatch = queryInfo.contextTokens.length > 0 && productTokenMatches === queryInfo.contextTokens.length;

    if (familyRoute && codeMatch && codeMatch.strength >= 128) {
      return {
        tier: 0,
        score: buildScore(0, 860 + codeMatch.strength + favoriteBoost + popularityBoost),
        matchType: codeMatch.matchType,
        matchedPackageVariantId: codeMatch.matchedPackageVariantId,
        matchedPackageVariantName: codeMatch.matchedPackageVariantName
      };
    }

    if (familyRoute && hasCompleteBrandMatch) {
      const detail = 840
        + familyRoute.quality
        + favoriteBoost
        + popularityBoost
        + brandTokenMatches * 18
        - Math.min(familyRoute.modifierCount, 3);

      return {
        tier: 0,
        score: buildScore(0, detail),
        matchType: familyRoute.matchType === "alias" ? "alias" : "brand",
        matchedAlias: familyRoute.matchedAlias,
        matchedPackageVariantId: familyRoute.matchedPackageVariantId,
        matchedPackageVariantName: familyRoute.matchedPackageVariantName
      };
    }

    if (familyRoute && hasCompleteModifierMatch) {
      const detail = 810
        + familyRoute.quality
        + favoriteBoost
        + popularityBoost
        + productTokenMatches * 14
        - Math.min(familyRoute.modifierCount, 3);

      return {
        tier: 1,
        score: buildScore(1, detail),
        matchType: familyRoute.matchType,
        matchedAlias: familyRoute.matchedAlias,
        matchedPackageVariantId: familyRoute.matchedPackageVariantId,
        matchedPackageVariantName: familyRoute.matchedPackageVariantName
      };
    }

    if (familyRoute && familyRoute.route !== "support_alias") {
      return {
        tier: 2,
        score: buildScore(
          2,
          760 + familyRoute.quality + Math.round(favoriteBoost * 0.8) + popularityBoost
        ),
        matchType: familyRoute.matchType,
        matchedAlias: familyRoute.matchedAlias,
        matchedPackageVariantId: familyRoute.matchedPackageVariantId,
        matchedPackageVariantName: familyRoute.matchedPackageVariantName,
        familyFallback: true
      };
    }

    if (familyRoute && familyRoute.route === "support_alias") {
      return {
        tier: 3,
        score: buildScore(3, 700 + familyRoute.quality + Math.round(favoriteBoost * 0.6)),
        matchType: "alias",
        matchedAlias: familyRoute.matchedAlias,
        familyFallback: true
      };
    }
  }

  if (queryInfo.intent === "code_specific") {
    if (codeMatch) {
      const tier = codeMatch.strength >= 132 ? 0 : 1;

      return {
        tier,
        score: buildScore(tier, 840 + codeMatch.strength + favoriteBoost + popularityBoost),
        matchType: codeMatch.matchType,
        matchedPackageVariantId: codeMatch.matchedPackageVariantId,
        matchedPackageVariantName: codeMatch.matchedPackageVariantName
      };
    }

    if (familyRoute && familyRoute.route !== "support_alias") {
      return {
        tier: 2,
        score: buildScore(2, 700 + familyRoute.quality + Math.round(popularityBoost * 0.7)),
        matchType: familyRoute.matchType,
        matchedAlias: familyRoute.matchedAlias,
        matchedPackageVariantId: familyRoute.matchedPackageVariantId,
        matchedPackageVariantName: familyRoute.matchedPackageVariantName
      };
    }
  }

  return null;
};

const isBetterRank = (candidate: IngredientCandidateRank, current: IngredientCandidateRank | null) => (
  !current
  || candidate.tier < current.tier
  || (candidate.tier === current.tier && candidate.score > current.score)
);

const assignTextTier = ({
  best,
  entries,
  variants,
  tierMap,
  matchType,
  allowSubstring = false,
  buildExtras
}: {
  best: IngredientCandidateRank | null;
  entries: NormalizedEntry[];
  variants: string[];
  tierMap: Partial<Record<MatchKind, number>>;
  matchType: MatchType;
  allowSubstring?: boolean;
  buildExtras?: (entry: NormalizedEntry) => Omit<IngredientCandidateRank, "matchType" | "score" | "tier">;
}) => {
  let nextBest = best;

  for (const entry of entries) {
    const match = scoreTextMatch(entry.normalized, variants, { allowSubstring });
    if (!match) {
      continue;
    }

    const tier = tierMap[match.kind];
    if (typeof tier !== "number") {
      continue;
    }

    const candidate = {
      tier,
      score: buildScore(tier, match.detail),
      matchType,
      ...(buildExtras ? buildExtras(entry) : {})
    };

    if (isBetterRank(candidate, nextBest)) {
      nextBest = candidate;
    }
  }

  return nextBest;
};

const buildFallbackRank = (
  queryInfo: QueryAnalysis,
  normalizedCandidate: NormalizedCandidate
): IngredientCandidateRank | null => {
  const sameScriptNameEntries = normalizedCandidate.nameEntries
    .filter((entry) => matchesQueryScript(entry.normalized, queryInfo.queryScript));
  const crossScriptNameEntries = normalizedCandidate.nameEntries
    .filter((entry) => isCrossScriptField(entry.normalized, queryInfo.queryScript));
  const sameScriptAliasEntries = normalizedCandidate.aliasEntries
    .filter((entry) => matchesQueryScript(entry.normalized, queryInfo.queryScript));
  const crossScriptAliasEntries = normalizedCandidate.aliasEntries
    .filter((entry) => isCrossScriptField(entry.normalized, queryInfo.queryScript));
  const sameScriptPackageEntries = normalizedCandidate.packageFieldEntries
    .filter((entry) => matchesQueryScript(entry.normalized, queryInfo.queryScript));
  const crossScriptPackageEntries = normalizedCandidate.packageFieldEntries
    .filter((entry) => isCrossScriptField(entry.normalized, queryInfo.queryScript));

  let best: IngredientCandidateRank | null = null;

  best = assignTextTier({
    best,
    entries: sameScriptNameEntries,
    variants: [queryInfo.base],
    tierMap: {
      exact: 0,
      prefix: 1,
      token_start: 1,
      all_tokens: 1
    },
    matchType: "name"
  });

  if (queryInfo.sameScriptFamilyVariants.length > 0) {
    best = assignTextTier({
      best,
      entries: sameScriptNameEntries,
      variants: queryInfo.sameScriptFamilyVariants,
      tierMap: {
        exact: 2,
        prefix: 2,
        token_start: 2,
        all_tokens: 2,
        contains: 2
      },
      allowSubstring: true,
      matchType: "name"
    });
  }

  best = assignTextTier({
    best,
    entries: sameScriptAliasEntries,
    variants: queryInfo.sameScriptVariants,
    tierMap: {
      exact: 3,
      prefix: 3,
      token_start: 3,
      all_tokens: 3,
      contains: 3
    },
    allowSubstring: true,
    matchType: "alias",
    buildExtras: (entry) => ({
      matchedAlias: entry.value
    })
  });

  if (normalizedCandidate.productCodeEntry) {
    best = assignTextTier({
      best,
      entries: [normalizedCandidate.productCodeEntry],
      variants: queryInfo.sameScriptVariants,
      tierMap: {
        exact: 4,
        prefix: 4,
        token_start: 4
      },
      matchType: "code"
    });
  }

  best = assignTextTier({
    best,
    entries: sameScriptPackageEntries,
    variants: queryInfo.sameScriptVariants,
    tierMap: {
      exact: 4,
      prefix: 4,
      token_start: 4,
      all_tokens: 4
    },
    matchType: "package",
    buildExtras: (entry) => ({
      matchedPackageVariantId: (entry as PackageFieldEntry).variantId ?? null,
      matchedPackageVariantName: (entry as PackageFieldEntry).variantName ?? entry.value
    })
  });

  if (queryInfo.crossScriptVariants.length > 0) {
    best = assignTextTier({
      best,
      entries: crossScriptNameEntries,
      variants: queryInfo.crossScriptVariants,
      tierMap: {
        exact: 5,
        prefix: 5,
        token_start: 5,
        all_tokens: 5,
        contains: 5
      },
      allowSubstring: true,
      matchType: "name"
    });

    best = assignTextTier({
      best,
      entries: crossScriptAliasEntries,
      variants: queryInfo.crossScriptVariants,
      tierMap: {
        exact: 6,
        prefix: 6,
        token_start: 6,
        all_tokens: 6,
        contains: 6
      },
      allowSubstring: true,
      matchType: "alias",
      buildExtras: (entry) => ({
        matchedAlias: entry.value
      })
    });

    if (normalizedCandidate.productCodeEntry) {
      best = assignTextTier({
        best,
        entries: [normalizedCandidate.productCodeEntry],
        variants: queryInfo.crossScriptVariants,
        tierMap: {
          exact: 6,
          prefix: 6,
          token_start: 6
        },
        matchType: "code"
      });
    }

    best = assignTextTier({
      best,
      entries: crossScriptPackageEntries,
      variants: queryInfo.crossScriptVariants,
      tierMap: {
        exact: 6,
        prefix: 6,
        token_start: 6,
        all_tokens: 6
      },
      matchType: "package",
      buildExtras: (entry) => ({
        matchedPackageVariantId: (entry as PackageFieldEntry).variantId ?? null,
        matchedPackageVariantName: (entry as PackageFieldEntry).variantName ?? entry.value
      })
    });
  }

  best = assignTextTier({
    best,
    entries: normalizedCandidate.brandEntries,
    variants: queryInfo.allVariants,
    tierMap: {
      exact: 7,
      prefix: 7,
      token_start: 7,
      all_tokens: 7,
      contains: 7
    },
    allowSubstring: true,
    matchType: "brand"
  });

  const baseTokens = tokenize(queryInfo.base);
  const primaryFields = [
    ...normalizedCandidate.nameEntries.map((entry) => entry.normalized),
    ...normalizedCandidate.aliasEntries.map((entry) => entry.normalized),
    normalizedCandidate.productCodeEntry?.normalized ?? "",
    ...normalizedCandidate.packageFieldEntries.map((entry) => entry.normalized)
  ].filter(Boolean);
  const secondaryFields = [
    ...normalizedCandidate.brandEntries.map((entry) => entry.normalized)
  ].filter(Boolean);

  if (hasDistributedTokenMatch({
    tokens: baseTokens,
    primaryFields,
    secondaryFields
  })) {
    const candidate = {
      tier: 8,
      score: buildScore(8, 760 + Math.min(80, baseTokens.join("").length * 6)),
      matchType: "token" as const
    };

    if (isBetterRank(candidate, best)) {
      best = candidate;
    }
  }

  const tokenMatchVariants = queryInfo.sameScriptVariants.length > 0
    ? queryInfo.sameScriptVariants
    : [queryInfo.base];
  if (tokenMatchVariants.some((variant) => hasAllTokens(variant, normalizedCandidate.searchTextNorm))) {
    const candidate = {
      tier: 8,
      score: buildScore(8, 700 + Math.min(100, queryInfo.base.length * 5)),
      matchType: "token" as const
    };

    if (isBetterRank(candidate, best)) {
      best = candidate;
    }
  }

  const fuzzyBonus = Math.max(
    0,
    ...queryInfo.allVariants.map((variant) => calcFuzzyBonus(
      variant,
      [
        ...normalizedCandidate.nameEntries.map((entry) => entry.normalized),
        ...normalizedCandidate.aliasEntries.map((entry) => entry.normalized)
      ]
    ))
  );

  if (fuzzyBonus > 0) {
    const candidate = {
      tier: 9,
      score: buildScore(9, 600 + fuzzyBonus),
      matchType: "token" as const
    };

    if (isBetterRank(candidate, best)) {
      best = candidate;
    }
  }

  return best;
};

const buildConsumableRank = (
  queryInfo: QueryAnalysis,
  candidate: RankedCandidate,
  normalizedCandidate: NormalizedCandidate
): IngredientCandidateRank | null => {
  const sameScriptMarketAliases = normalizedCandidate.marketAliasEntries
    .filter((entry) => matchesQueryScript(entry.normalized, queryInfo.queryScript));
  const sameScriptPriorityAliases = normalizedCandidate.priorityAliasEntries
    .filter((entry) => matchesQueryScript(entry.normalized, queryInfo.queryScript));
  const sameScriptPackageEntries = normalizedCandidate.packageFieldEntries
    .filter((entry) => matchesQueryScript(entry.normalized, queryInfo.queryScript));
  const sameScriptNameEntries = normalizedCandidate.nameEntries
    .filter((entry) => matchesQueryScript(entry.normalized, queryInfo.queryScript));
  const sameScriptAliasEntries = normalizedCandidate.aliasEntries
    .filter((entry) => matchesQueryScript(entry.normalized, queryInfo.queryScript));
  const variants = queryInfo.sameScriptVariants.length > 0
    ? queryInfo.sameScriptVariants
    : [queryInfo.base];
  const packageLikeQuery = isPackageLikeQuery(queryInfo);
  let best: IngredientCandidateRank | null = null;

  best = assignTextTier({
    best,
    entries: sameScriptPackageEntries,
    variants,
    tierMap: packageLikeQuery
      ? {
        exact: 0,
        prefix: 0,
        token_start: 0,
        all_tokens: 0,
        contains: 1
      }
      : {
        exact: 0,
        prefix: 1,
        token_start: 1,
        all_tokens: 1,
        contains: 2
      },
    allowSubstring: true,
    matchType: "package",
    buildExtras: (entry) => ({
      matchedPackageVariantId: (entry as PackageFieldEntry).variantId ?? null,
      matchedPackageVariantName: (entry as PackageFieldEntry).variantName ?? entry.value
    })
  });

  best = assignTextTier({
    best,
    entries: sameScriptPriorityAliases,
    variants,
    tierMap: packageLikeQuery
      ? {
        exact: 1,
        prefix: 1,
        token_start: 2,
        all_tokens: 2,
        contains: 3
      }
      : {
        exact: 0,
        prefix: 0,
        token_start: 1,
        all_tokens: 1,
        contains: 2
      },
    allowSubstring: true,
    matchType: "alias",
    buildExtras: (entry) => ({
      matchedAlias: entry.value
    })
  });

  best = assignTextTier({
    best,
    entries: sameScriptMarketAliases,
    variants,
    tierMap: packageLikeQuery
      ? {
        exact: 1,
        prefix: 1,
        token_start: 2,
        all_tokens: 2,
        contains: 3
      }
      : {
        exact: 0,
        prefix: 1,
        token_start: 1,
        all_tokens: 1,
        contains: 2
      },
    allowSubstring: true,
    matchType: "alias",
    buildExtras: (entry) => ({
      matchedAlias: entry.value
    })
  });

  best = assignTextTier({
    best,
    entries: sameScriptNameEntries,
    variants,
    tierMap: {
      exact: 1,
      prefix: 1,
      token_start: 2,
      all_tokens: 2,
      contains: 3
    },
    allowSubstring: true,
    matchType: "name"
  });

  best = assignTextTier({
    best,
    entries: sameScriptAliasEntries,
    variants,
    tierMap: {
      exact: 2,
      prefix: 2,
      token_start: 3,
      all_tokens: 3,
      contains: 4
    },
    allowSubstring: true,
    matchType: "alias",
    buildExtras: (entry) => ({
      matchedAlias: entry.value
    })
  });

  if (!best) {
    return null;
  }

  const favoriteBoost = computeFavoriteBoost(queryInfo, candidate) * 10;
  const popularityBoost = computePopularityBoost(queryInfo, candidate) * 8;

  return {
    ...best,
    score: best.score + favoriteBoost + popularityBoost
  };
};

export const rankIngredientCandidate = (
  query: string | string[],
  candidate: RankedCandidate,
  options: RankingOptions = {}
): IngredientCandidateRank | null => {
  const queryText = Array.isArray(query) ? query[0] ?? "" : query;
  const queryInfo = analyzeQuery(queryText, options);
  if (!queryInfo) {
    return null;
  }

  const normalizedCandidate = normalizeCandidate(candidate);
  const consumableRank = isConsumableCandidate(candidate)
    ? buildConsumableRank(queryInfo, candidate, normalizedCandidate)
    : null;
  if (consumableRank) {
    return consumableRank;
  }
  const intentAwareRank = queryInfo.intent === "default"
    ? null
    : buildIntentAwareRank(queryInfo, candidate, normalizedCandidate);

  if (intentAwareRank) {
    return intentAwareRank;
  }

  return buildFallbackRank(queryInfo, normalizedCandidate);
};

export const matchesIngredientFamilyScope = (
  familyQuery: string,
  candidate: RankedCandidate
) => {
  // Скоуп-фильтр quick-start НЕ двухпроходный — раскладка тут всегда учтена
  // (прежнее поведение buildQueryVariants до вынесения раскладки в фолбэк).
  const queryInfo = analyzeQuery(familyQuery, { includeLayoutVariants: true });
  if (!queryInfo?.family) {
    return false;
  }

  const normalizedCandidate = normalizeCandidate(candidate);
  return buildIntentAwareRank(queryInfo, candidate, normalizedCandidate) !== null;
};

export const scoreIngredientCandidate = (
  query: string | string[],
  candidate: RankedCandidate,
  options: RankingOptions = {}
) => rankIngredientCandidate(query, candidate, options)?.score ?? 0;

/**
 * Раскладка — строго фолбэк (см. ТЗ С1): второй проход запускаем только
 * когда первый (без раскладочных вариантов) не дал ни одного результата и
 * swapKeyboardLayout реально меняет запрос. Признак usedLayoutFallback пока
 * не идёт наружу в DTO (см. С4), но уже доступен во внутреннем возврате.
 */
export const rankQueryTwoPass = <T>(
  query: string,
  rankOnce: (includeLayoutVariants: boolean) => T[]
): { results: T[]; usedLayoutFallback: boolean } => {
  const base = rankOnce(false);
  if (base.length > 0) {
    return { results: base, usedLayoutFallback: false };
  }

  const normalizedQuery = normalizeSearchText(query);
  const layoutSwap = swapKeyboardLayout(query);
  if (!layoutSwap || layoutSwap === normalizedQuery) {
    return { results: base, usedLayoutFallback: false };
  }

  const layoutResults = rankOnce(true);
  return { results: layoutResults, usedLayoutFallback: layoutResults.length > 0 };
};
