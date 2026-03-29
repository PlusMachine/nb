import type {
  BjcpCatalogData,
  BjcpCatalogStyle,
  BjcpFamily
} from "@nb/content";

import {
  buildQueryVariants,
  normalizeSearchText
} from "@/features/ingredients/normalization";

export type BjcpCatalogView = "families" | "bjcp";
export type BjcpCatalogSortOption = "relevance" | "name" | "code";
export type BjcpQuickChipId =
  | "light"
  | "dark"
  | "ipa_hoppy"
  | "lager"
  | "session"
  | "strong"
  | "sour"
;

export type BjcpFilterGroup = "color" | "fermentation" | "strength" | "region" | "character";
export type BjcpFilterOptionId =
  | "light"
  | "amber"
  | "dark"
  | "ale"
  | "lager"
  | "mixed"
  | "session"
  | "standard"
  | "strong"
  | "very_strong"
  | "america"
  | "britain_ireland"
  | "germany_czech"
  | "belgium_france"
  | "eastern_europe"
  | "local_other"
  | "hoppy"
  | "malty"
  | "sour"
  | "roasty"
  | "smoked"
  | "fruity"
  | "spiced"
  | "wood_aged";

export type BjcpAdvancedFilters = Record<BjcpFilterGroup, BjcpFilterOptionId[]>;

export type BjcpCatalogState = {
  view: BjcpCatalogView;
  q: string;
  family: string | null;
  category: string | null;
  chips: BjcpQuickChipId[];
  filters: BjcpAdvancedFilters;
  sort: BjcpCatalogSortOption;
};

export type BjcpQuickChip = {
  id: BjcpQuickChipId;
  label: string;
  description: string;
};

export type BjcpFilterOption = {
  id: BjcpFilterOptionId;
  label: string;
};

export type BjcpSuggestion = {
  id: string;
  kind: "style" | "family" | "category";
  label: string;
  subtitle: string;
  href?: string;
  familyId?: string;
  categoryId?: string;
};

export type BjcpSuggestionSections = {
  styles: BjcpSuggestion[];
  families: BjcpSuggestion[];
  categories: BjcpSuggestion[];
};

export type BjcpCatalogResults = {
  showResults: boolean;
  title: string;
  description: string;
  styles: BjcpCatalogStyle[];
};

export type BjcpActivePill = {
  key: string;
  label: string;
  type: "chip" | "filter" | "scope";
  group?: BjcpFilterGroup;
  value?: BjcpFilterOptionId | BjcpQuickChipId;
};

type CatalogCategory = BjcpCatalogData["categories"][number];
type ScoredStyle = {
  style: BjcpCatalogStyle;
  score: number;
};
type ScoredFamily = {
  family: BjcpFamily;
  score: number;
};
type ScoredCategory = {
  category: CatalogCategory;
  score: number;
};

const collator = new Intl.Collator("ru", { numeric: true, sensitivity: "base" });

const defaultFilters = (): BjcpAdvancedFilters => ({
  color: [],
  fermentation: [],
  strength: [],
  region: [],
  character: []
});

const quickChips: Record<BjcpQuickChipId, BjcpQuickChip> = {
  light: {
    id: "light",
    label: "Светлое",
    description: "Светлые и более лёгкие по цвету стили"
  },
  dark: {
    id: "dark",
    label: "Тёмное",
    description: "Тёмные, жареные и насыщенные по цвету стили"
  },
  ipa_hoppy: {
    id: "ipa_hoppy",
    label: "IPA / Хмелевое",
    description: "IPA, APA и ярко хмелевые стили"
  },
  lager: {
    id: "lager",
    label: "Лагер",
    description: "Лагеры всех подтипов"
  },
  session: {
    id: "session",
    label: "Лёгкое",
    description: "Невысокая крепость и высокая питкость"
  },
  strong: {
    id: "strong",
    label: "Крепкое",
    description: "Крепкие и очень крепкие стили"
  },
  sour: {
    id: "sour",
    label: "Кислое",
    description: "Кислые и mixed fermentation стили"
  }
};

export const sortLabels: Record<BjcpCatalogSortOption, string> = {
  relevance: "По релевантности",
  name: "По названию",
  code: "По BJCP коду"
};

export const advancedFilterDefinitions: Array<{
  id: BjcpFilterGroup;
  label: string;
  options: BjcpFilterOption[];
}> = [
  {
    id: "color",
    label: "Цвет",
    options: [
      { id: "light", label: "Светлое" },
      { id: "amber", label: "Янтарное" },
      { id: "dark", label: "Тёмное" }
    ]
  },
  {
    id: "fermentation",
    label: "Тип брожения",
    options: [
      { id: "ale", label: "Эль" },
      { id: "lager", label: "Лагер" },
      { id: "mixed", label: "Смешанное / дикое" }
    ]
  },
  {
    id: "strength",
    label: "Крепость",
    options: [
      { id: "session", label: "Лёгкое" },
      { id: "standard", label: "Стандартное" },
      { id: "strong", label: "Крепкое" },
      { id: "very_strong", label: "Очень крепкое" }
    ]
  },
  {
    id: "region",
    label: "Школа / регион",
    options: [
      { id: "america", label: "Америка" },
      { id: "britain_ireland", label: "Британия и Ирландия" },
      { id: "germany_czech", label: "Германия и Чехия" },
      { id: "belgium_france", label: "Бельгия и Франция" },
      { id: "eastern_europe", label: "Восточная Европа" },
      { id: "local_other", label: "Локальные / прочее" }
    ]
  },
  {
    id: "character",
    label: "Характер / особенности",
    options: [
      { id: "hoppy", label: "Хмелевое" },
      { id: "malty", label: "Солодовое" },
      { id: "sour", label: "Кислое" },
      { id: "roasty", label: "Тёмное / жареное" },
      { id: "smoked", label: "Копчёное" },
      { id: "fruity", label: "Фруктовое" },
      { id: "spiced", label: "Пряное" },
      { id: "wood_aged", label: "Выдержанное в дереве / бочке" }
    ]
  }
];

const styleAliasMap: Record<string, string[]> = {
  "5B": ["kolsch", "kölsch", "кельш"],
  "10A": ["weissbier", "weizen", "вайцен", "вайценбир", "hefeweizen"],
  "10B": ["dunkelweizen", "dunkles weissbier", "тёмный вайцен", "дункельвайцен"],
  "10C": ["weizenbock", "вайценбок"],
  "12C": ["english ipa"],
  "21A": ["american ipa", "west coast ipa"],
  "21C": ["hazy ipa", "new england ipa", "new england", "neipa", "неипа", "нэипа"],
  "21B-Belgian IPA": ["belgian ipa", "бельгийский ipa"],
  "21B-Black IPA": ["black ipa", "черный ipa", "чёрный ipa"],
  "21B-Brown IPA": ["brown ipa", "коричневый ipa"],
  "21B-Red IPA": ["red ipa", "красный ipa"],
  "21B-Rye IPA": ["rye ipa", "ржаной ipa"],
  "21B-White IPA": ["white ipa", "белый ipa"],
  "21B-Brut IPA": ["brut ipa", "брют ipa", "брют-ipa"],
  "24A": ["witbier", "blanche", "бланш", "витбир", "вит"],
  "25A": ["saison"],
  "27A": ["gose", "гозе"],
  "27B": ["gueuze", "геуз"],
  "27C": ["lambic", "ламбик"],
  "27D": ["fruit lambic", "fruit lambiek", "фруктовый ламбик"],
  "31A": ["alternative grain beer", "альтернативные зерновые"],
  "32A": ["kvass", "квас"],
  "X5": ["piwo grodziskie", "grätzer", "гродзиское", "гродзиский"]
};

const foldDiacritics = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replaceAll("ß", "ss");

const dedupe = (values: string[]) => {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeSearchText(foldDiacritics(value));
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    out.push(value);
  }

  return out;
};

const isKnownQuickChip = (value: string): value is BjcpQuickChipId => value in quickChips;

const getKnownFilterValues = (group: BjcpFilterGroup) => new Set(
  advancedFilterDefinitions
    .find((definition) => definition.id === group)
    ?.options.map((option) => option.id) ?? []
);

const buildEmptyState = (catalog: BjcpCatalogData): BjcpCatalogState => ({
  view: catalog.uiStrategy.defaultView,
  q: "",
  family: null,
  category: null,
  chips: [],
  filters: defaultFilters(),
  sort: "code"
});

const filterGroups: BjcpFilterGroup[] = ["color", "fermentation", "strength", "region", "character"];

const serializeFilters = (filters: BjcpAdvancedFilters) => filterGroups
  .map((group) => {
    if (!filters[group].length) {
      return null;
    }

    return `${group}:${filters[group].join(",")}`;
  })
  .filter(Boolean)
  .join(";");

const parseFilters = (raw: string | null) => {
  const next = defaultFilters();
  if (!raw) {
    return next;
  }

  for (const chunk of raw.split(";")) {
    const [group, values] = chunk.split(":");
    if (!group || !values || !filterGroups.includes(group as BjcpFilterGroup)) {
      continue;
    }

    const knownValues = getKnownFilterValues(group as BjcpFilterGroup);
    next[group as BjcpFilterGroup] = values
      .split(",")
      .filter((value): value is BjcpFilterOptionId => knownValues.has(value as BjcpFilterOptionId));
  }

  return next;
};

export const parseBjcpCatalogState = (
  searchParams: Pick<URLSearchParams, "get">,
  catalog: BjcpCatalogData
): BjcpCatalogState => {
  const familyIds = new Set(catalog.families.map((family: BjcpFamily) => family.id));
  const categoryIds = new Set(catalog.categories.map((category: CatalogCategory) => category.id));
  const state = buildEmptyState(catalog);

  const view = searchParams.get("view");
  if (view === "bjcp") {
    state.view = "bjcp";
  }

  state.q = searchParams.get("q")?.trim() ?? "";

  const family = searchParams.get("family");
  if (family && familyIds.has(family)) {
    state.family = family;
  }

  const category = searchParams.get("category");
  if (category && categoryIds.has(category)) {
    state.category = category;
  }

  const chips = searchParams.get("chips")?.split(",").filter(isKnownQuickChip) ?? [];
  state.chips = chips;
  state.filters = parseFilters(searchParams.get("filters"));

  const sort = searchParams.get("sort");
  if (sort === "name" || sort === "code" || sort === "relevance") {
    state.sort = sort;
  } else if (state.q) {
    state.sort = "relevance";
  }

  return state;
};

export const buildBjcpCatalogHref = (
  pathname: string,
  state: BjcpCatalogState
) => {
  const params = new URLSearchParams();

  if (state.view !== "families") {
    params.set("view", state.view);
  }
  if (state.q.trim()) {
    params.set("q", state.q.trim());
  }
  if (state.family) {
    params.set("family", state.family);
  }
  if (state.category) {
    params.set("category", state.category);
  }
  if (state.chips.length) {
    params.set("chips", state.chips.join(","));
  }
  const serializedFilters = serializeFilters(state.filters);
  if (serializedFilters) {
    params.set("filters", serializedFilters);
  }
  if (state.sort !== (state.q ? "relevance" : "code")) {
    params.set("sort", state.sort);
  }

  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
};

const getBadges = (style: BjcpCatalogStyle) => new Set(style.badgesRu);
const styleInFamily = (style: BjcpCatalogStyle, familyId: string) => style.familyIds.includes(familyId);

const getStyleColor = (style: BjcpCatalogStyle): BjcpFilterOptionId => {
  const badges = getBadges(style);
  if (badges.has("Тёмное")) {
    return "dark";
  }
  if (badges.has("Янтарное")) {
    return "amber";
  }
  return "light";
};

export const getStyleFermentationLabel = (style: BjcpCatalogStyle) => {
  const badges = getBadges(style);
  if (badges.has("Лагер")) {
    return "Лагер";
  }
  if (badges.has("Дикое/смешанное брожение")) {
    return "Смешанное / дикое";
  }
  return badges.has("Эль") ? "Эль" : "Эль";
};

const getStyleFermentation = (style: BjcpCatalogStyle): BjcpFilterOptionId => {
  const badges = getBadges(style);
  if (badges.has("Лагер")) {
    return "lager";
  }
  if (badges.has("Дикое/смешанное брожение")) {
    return "mixed";
  }
  return "ale";
};

const getStyleStrength = (style: BjcpCatalogStyle): BjcpFilterOptionId => {
  const badges = getBadges(style);
  if (badges.has("Очень крепкое")) {
    return "very_strong";
  }
  if (badges.has("Крепкое")) {
    return "strong";
  }
  if (badges.has("Лёгкое")) {
    return "session";
  }
  return "standard";
};

const getStyleRegion = (style: BjcpCatalogStyle): BjcpFilterOptionId => {
  const haystack = normalizeSearchText(foldDiacritics([
    style.title,
    style.titleEn,
    style.categoryNameRu,
    ...style.familyNamesRu
  ].join(" ")));

  if (styleInFamily(style, "local")) {
    return "local_other";
  }
  if (haystack.includes("американ") || haystack.includes("american") || haystack.includes("california")) {
    return "america";
  }
  if (
    haystack.includes("британ") || haystack.includes("irish")
    || haystack.includes("english") || haystack.includes("scottish")
    || haystack.includes("ирланд")
  ) {
    return "britain_ireland";
  }
  if (
    haystack.includes("немец") || haystack.includes("герман")
    || haystack.includes("german") || haystack.includes("czech")
    || haystack.includes("чеш") || haystack.includes("kolsch")
    || haystack.includes("kelsch") || haystack.includes("weizen")
    || haystack.includes("вайс") || haystack.includes("пилс")
    || haystack.includes("кельш")
  ) {
    return "germany_czech";
  }
  if (
    haystack.includes("бельг") || haystack.includes("belg")
    || haystack.includes("saison") || haystack.includes("witbier")
    || haystack.includes("biere") || haystack.includes("biere de garde")
    || haystack.includes("farmhouse") || haystack.includes("trappist")
    || haystack.includes("france") || haystack.includes("франц")
  ) {
    return "belgium_france";
  }
  if (
    haystack.includes("балтий") || haystack.includes("polish")
    || haystack.includes("grodziskie") || haystack.includes("lithuan")
    || haystack.includes("русс")
  ) {
    return "eastern_europe";
  }
  return "local_other";
};

const getStyleCharacters = (style: BjcpCatalogStyle): BjcpFilterOptionId[] => {
  const badges = getBadges(style);
  const out = new Set<BjcpFilterOptionId>();

  if (badges.has("Хмелевое") || styleInFamily(style, "ipa_hoppy")) {
    out.add("hoppy");
  }
  if (badges.has("Солодовое") || styleInFamily(style, "malty_lagers") || styleInFamily(style, "british_irish")) {
    out.add("malty");
  }
  if (badges.has("Кислое") || styleInFamily(style, "sour_wild")) {
    out.add("sour");
  }
  if (badges.has("Жареное") || styleInFamily(style, "porters_stouts") || getStyleColor(style) === "dark") {
    out.add("roasty");
  }
  if (badges.has("Копчёное")) {
    out.add("smoked");
  }
  if (badges.has("Фруктовое")) {
    out.add("fruity");
  }
  if (badges.has("Пряное")) {
    out.add("spiced");
  }
  if (badges.has("Выдержка в дереве/бочке")) {
    out.add("wood_aged");
  }

  return [...out];
};

const matchesQuickChip = (style: BjcpCatalogStyle, chipId: BjcpQuickChipId) => {
  const badges = getBadges(style);
  const strength = getStyleStrength(style);

  switch (chipId) {
    case "light":
      return getStyleColor(style) === "light";
    case "dark":
      return getStyleColor(style) === "dark";
    case "ipa_hoppy":
      return styleInFamily(style, "ipa_hoppy") || badges.has("Хмелевое");
    case "lager":
      return badges.has("Лагер");
    case "session":
      return strength === "session";
    case "strong":
      return strength === "strong" || strength === "very_strong";
    case "sour":
      return styleInFamily(style, "sour_wild") || badges.has("Кислое");
    default:
      return false;
  }
};

const matchesAdvancedFilters = (style: BjcpCatalogStyle, filters: BjcpAdvancedFilters) => {
  if (filters.color.length && !filters.color.includes(getStyleColor(style))) {
    return false;
  }
  if (filters.fermentation.length && !filters.fermentation.includes(getStyleFermentation(style))) {
    return false;
  }
  if (filters.strength.length && !filters.strength.includes(getStyleStrength(style))) {
    return false;
  }
  if (filters.region.length && !filters.region.includes(getStyleRegion(style))) {
    return false;
  }
  if (filters.character.length) {
    const characters = getStyleCharacters(style);
    if (!filters.character.every((value) => characters.includes(value))) {
      return false;
    }
  }

  return true;
};

const hasAnyAdvancedFilters = (filters: BjcpAdvancedFilters) => filterGroups.some((group) => filters[group].length > 0);

export const hasActiveBjcpCatalogControls = (state: BjcpCatalogState) => (
  Boolean(state.q.trim())
  || Boolean(state.family)
  || Boolean(state.category)
  || state.chips.length > 0
  || hasAnyAdvancedFilters(state.filters)
);

const buildSearchTerms = (style: BjcpCatalogStyle) => {
  const explicitAliases = styleAliasMap[style.bjcpId] ?? [];
  const nameAliases = dedupe([
    style.bjcpId,
    style.title,
    style.titleEn,
    foldDiacritics(style.titleEn),
    ...explicitAliases
  ]);

  return {
    exact: nameAliases,
    family: dedupe([...style.familyNamesRu, ...style.familyNamesEn]),
    category: dedupe([style.categoryId, style.categoryNameRu]),
    badges: style.badgesRu
  };
};

const scoreText = (candidate: string, variant: string, exactScore: number, prefixScore: number, containsScore: number) => {
  const normalizedCandidate = normalizeSearchText(foldDiacritics(candidate));
  if (!normalizedCandidate) {
    return 0;
  }
  if (normalizedCandidate === variant) {
    return exactScore;
  }
  if (normalizedCandidate.startsWith(variant)) {
    return prefixScore;
  }
  if (normalizedCandidate.includes(variant)) {
    return containsScore;
  }
  return 0;
};

const scoreStyle = (style: BjcpCatalogStyle, query: string) => {
  const variants = buildQueryVariants(foldDiacritics(query));
  let score = 0;
  const terms = buildSearchTerms(style);

  for (const variant of variants) {
    score = Math.max(score, scoreText(style.bjcpId, variant, 1200, 980, 0));

    for (const candidate of terms.exact) {
      score = Math.max(score, scoreText(candidate, variant, 1100, 860, 720));
    }

    for (const candidate of styleAliasMap[style.bjcpId] ?? []) {
      score = Math.max(score, scoreText(candidate, variant, 1040, 820, 680));
    }

    for (const candidate of terms.family) {
      score = Math.max(score, scoreText(candidate, variant, 420, 360, 280));
    }

    for (const candidate of terms.category) {
      score = Math.max(score, scoreText(candidate, variant, 380, 320, 240));
    }

    for (const candidate of terms.badges) {
      score = Math.max(score, scoreText(candidate, variant, 260, 220, 180));
    }
  }

  return score;
};

const scoreFamily = (family: BjcpFamily, query: string) => {
  const variants = buildQueryVariants(foldDiacritics(query));
  let score = 0;
  const aliases = dedupe([family.id, family.nameRu, family.nameEn]);

  for (const variant of variants) {
    for (const candidate of aliases) {
      score = Math.max(score, scoreText(candidate, variant, 700, 520, 320));
    }
  }

  return score;
};

const scoreCategory = (categoryId: string, categoryName: string, query: string) => {
  const variants = buildQueryVariants(foldDiacritics(query));
  let score = 0;

  for (const variant of variants) {
    score = Math.max(score, scoreText(categoryId, variant, 680, 520, 0));
    score = Math.max(score, scoreText(categoryName, variant, 620, 480, 300));
  }

  return score;
};

export const getBjcpSearchSuggestions = (query: string, catalog: BjcpCatalogData): BjcpSuggestionSections => {
  const trimmed = query.trim();
  if (normalizeSearchText(trimmed).length < 2) {
    return {
      styles: [],
      families: [],
      categories: []
    };
  }

  const styles = catalog.styles
    .map((style: BjcpCatalogStyle): ScoredStyle => ({ style, score: scoreStyle(style, trimmed) }))
    .filter((entry: ScoredStyle) => entry.score > 0)
    .sort((left: ScoredStyle, right: ScoredStyle) => right.score - left.score || collator.compare(left.style.bjcpId, right.style.bjcpId))
    .slice(0, 6)
    .map(({ style }: ScoredStyle) => ({
      id: style.bjcpId,
      kind: "style" as const,
      label: `${style.bjcpId} · ${style.title}`,
      subtitle: `${style.titleEn} · ${style.familyNameRu}`,
      href: `/bjcp/${style.slug}`
    }));

  const families = catalog.families
    .map((family: BjcpFamily): ScoredFamily => ({ family, score: scoreFamily(family, trimmed) }))
    .filter((entry: ScoredFamily) => entry.score > 0)
    .sort((left: ScoredFamily, right: ScoredFamily) => right.score - left.score || left.family.sortOrder - right.family.sortOrder)
    .slice(0, 3)
    .map(({ family }: ScoredFamily) => ({
      id: family.id,
      kind: "family" as const,
      label: family.nameRu,
      subtitle: `${family.styleCount} стилей`,
      familyId: family.id
    }));

  const categories = catalog.categories
    .map((category: CatalogCategory): ScoredCategory => ({ category, score: scoreCategory(category.id, category.nameRu, trimmed) }))
    .filter((entry: ScoredCategory) => entry.score > 0)
    .sort((left: ScoredCategory, right: ScoredCategory) => right.score - left.score || collator.compare(left.category.id, right.category.id))
    .slice(0, 4)
    .map(({ category }: ScoredCategory) => ({
      id: category.id,
      kind: "category" as const,
      label: `${category.id} · ${category.nameRu}`,
      subtitle: `${category.articleCount} стилей`,
      categoryId: category.id
    }));

  return {
    styles,
    families,
    categories
  };
};

const sortStyles = (
  styles: BjcpCatalogStyle[],
  sort: BjcpCatalogSortOption,
  relevance: Map<string, number> | null
) => {
  const items = [...styles];

  if (sort === "name") {
    return items.sort((left, right) => collator.compare(left.title, right.title));
  }

  if (sort === "relevance" && relevance) {
    return items.sort((left, right) => {
      const scoreDelta = (relevance.get(right.slug) ?? 0) - (relevance.get(left.slug) ?? 0);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      return collator.compare(left.bjcpId, right.bjcpId);
    });
  }

  return items.sort((left, right) => collator.compare(left.bjcpId, right.bjcpId));
};

export const getFamilyCards = (catalog: BjcpCatalogData) => catalog.families.map((family: BjcpFamily) => ({
  ...family
}));

export const getQuickChips = (_catalog: BjcpCatalogData) => ([
  "light",
  "dark",
  "ipa_hoppy",
  "lager",
  "session",
  "strong",
  "sour"
] as BjcpQuickChipId[]).map((id) => quickChips[id]);

const applyCatalogScope = (styles: BjcpCatalogStyle[], state: BjcpCatalogState) => {
  let scoped = styles;

  if (state.view === "families" && state.family) {
    scoped = scoped.filter((style) => style.familyIds.includes(state.family!));
  }

  if (state.view === "bjcp" && state.category) {
    scoped = scoped.filter((style) => style.categoryId === state.category);
  }

  if (state.chips.length) {
    scoped = scoped.filter((style) => state.chips.every((chip) => matchesQuickChip(style, chip)));
  }

  if (hasAnyAdvancedFilters(state.filters)) {
    scoped = scoped.filter((style) => matchesAdvancedFilters(style, state.filters));
  }

  return scoped;
};

export const getBjcpCatalogResults = (state: BjcpCatalogState, catalog: BjcpCatalogData): BjcpCatalogResults => {
  const hasFilters = state.chips.length > 0 || hasAnyAdvancedFilters(state.filters);
  const searchQuery = state.q.trim();

  if (!searchQuery && !state.family && !state.category && !hasFilters) {
    return {
      showResults: false,
      title: "",
      description: "",
      styles: []
    };
  }

  let scopedStyles = catalog.styles;
  let relevance: Map<string, number> | null = null;

  if (searchQuery) {
    const scored = catalog.styles
      .map((style: BjcpCatalogStyle): ScoredStyle => ({ style, score: scoreStyle(style, searchQuery) }))
      .filter((entry: ScoredStyle) => entry.score > 0);

    relevance = new Map(scored.map((entry: ScoredStyle) => [entry.style.slug, entry.score] as const));
    scopedStyles = scored.map((entry: ScoredStyle) => entry.style);
  }

  scopedStyles = applyCatalogScope(scopedStyles, state);

  const defaultSort = searchQuery ? "relevance" : "code";
  const styles = sortStyles(scopedStyles, state.sort || defaultSort, relevance);

  if (searchQuery) {
    return {
      showResults: true,
      title: `Результаты поиска: ${searchQuery}`,
      description: "",
      styles
    };
  }

  if (state.view === "families" && state.family) {
    const family = catalog.families.find((item: BjcpFamily) => item.id === state.family);
    return {
      showResults: true,
      title: family?.nameRu ?? "Выбранное семейство",
      description: "",
      styles
    };
  }

  if (state.view === "bjcp" && state.category) {
    const category = catalog.categories.find((item: CatalogCategory) => item.id === state.category);
    return {
      showResults: true,
      title: category ? `${category.id} · ${category.nameRu}` : "Выбранная категория BJCP",
      description: "",
      styles
    };
  }

  if (state.chips.length === 1 && !hasAnyAdvancedFilters(state.filters)) {
    return {
      showResults: true,
      title: quickChips[state.chips[0]].label,
      description: "",
      styles
    };
  }

  return {
    showResults: true,
    title: "Подобранные стили",
    description: "",
    styles
  };
};

export const getCategoryPreviewStyles = (catalog: BjcpCatalogData, categoryId: string) => catalog.styles
  .filter((style: BjcpCatalogStyle) => style.categoryId === categoryId)
  .sort((left: BjcpCatalogStyle, right: BjcpCatalogStyle) => collator.compare(left.bjcpId, right.bjcpId));

export const getActivePills = (state: BjcpCatalogState, catalog: BjcpCatalogData): BjcpActivePill[] => {
  const pills: BjcpActivePill[] = [];

  if (state.family) {
    const family = catalog.families.find((item: BjcpFamily) => item.id === state.family);
    if (family) {
      pills.push({
        key: `family:${family.id}`,
        label: family.nameRu,
        type: "scope"
      });
    }
  }

  if (state.category) {
    const category = catalog.categories.find((item: CatalogCategory) => item.id === state.category);
    if (category) {
      pills.push({
        key: `category:${category.id}`,
        label: `${category.id} · ${category.nameRu}`,
        type: "scope"
      });
    }
  }

  for (const chip of state.chips) {
    pills.push({
      key: `chip:${chip}`,
      label: quickChips[chip].label,
      type: "chip",
      value: chip
    });
  }

  for (const group of advancedFilterDefinitions) {
    for (const value of state.filters[group.id]) {
      const option = group.options.find((item: BjcpFilterOption) => item.id === value);
      if (!option) {
        continue;
      }

      pills.push({
        key: `filter:${group.id}:${value}`,
        label: option.label,
        type: "filter",
        group: group.id,
        value
      });
    }
  }

  return pills;
};

export const removeFilterValue = (
  filters: BjcpAdvancedFilters,
  group: BjcpFilterGroup,
  value: BjcpFilterOptionId
): BjcpAdvancedFilters => ({
  ...filters,
  [group]: filters[group].filter((candidate) => candidate !== value)
});

export const toggleFilterValue = (
  filters: BjcpAdvancedFilters,
  group: BjcpFilterGroup,
  value: BjcpFilterOptionId
): BjcpAdvancedFilters => ({
  ...filters,
  [group]: filters[group].includes(value)
    ? filters[group].filter((candidate) => candidate !== value)
    : [...filters[group], value]
});
