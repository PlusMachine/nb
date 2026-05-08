import type { NumericRange } from "./types";

export type BjcpStyleSearchEntry = {
  id?: string;
  bjcpId: string;
  styleKey?: string | null;
  name?: string;
  nameRu?: string | null;
  nameEn?: string | null;
  title?: string;
  titleEn?: string;
  family?: string | null;
  familyRu?: string | null;
  familyNameRu?: string | null;
  familyNameEn?: string | null;
  familyNamesRu?: string[];
  familyNamesEn?: string[];
  categoryId?: string | null;
  categoryNameRu?: string | null;
  badgesRu?: string[];
  searchAliases?: string[];
  og?: NumericRange | null;
  fg?: NumericRange | null;
  abv?: NumericRange | null;
  ibu?: NumericRange | null;
  colorSrm?: NumericRange | null;
};

export type BjcpStyleSearchResult<T extends BjcpStyleSearchEntry> = {
  item: T;
  score: number;
};

const whitespaceRegex = /\s+/g;
const punctuationRegex = /[.,;:!?()[\]{}"“”«»'`´]+/g;
const separatorRegex = /[-_/\\|]+/g;

const ruToLatMap: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "g",
  д: "d",
  е: "e",
  ё: "e",
  ж: "zh",
  з: "z",
  и: "i",
  й: "y",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "kh",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya"
};

const latToRuTokens: Array<[string, string]> = [
  ["shch", "щ"],
  ["sch", "щ"],
  ["yo", "е"],
  ["jo", "е"],
  ["zh", "ж"],
  ["kh", "х"],
  ["ts", "ц"],
  ["ch", "ч"],
  ["sh", "ш"],
  ["yu", "ю"],
  ["ya", "я"],
  ["ye", "е"],
  ["yi", "и"],
  ["a", "а"],
  ["b", "б"],
  ["c", "к"],
  ["d", "д"],
  ["e", "е"],
  ["f", "ф"],
  ["g", "г"],
  ["h", "х"],
  ["i", "и"],
  ["j", "й"],
  ["k", "к"],
  ["l", "л"],
  ["m", "м"],
  ["n", "н"],
  ["o", "о"],
  ["p", "п"],
  ["q", "к"],
  ["r", "р"],
  ["s", "с"],
  ["t", "т"],
  ["u", "у"],
  ["v", "в"],
  ["w", "в"],
  ["x", "кс"],
  ["y", "и"],
  ["z", "з"]
];

const keyboardMapPairs = [
  ["q", "й"], ["w", "ц"], ["e", "у"], ["r", "к"], ["t", "е"], ["y", "н"], ["u", "г"], ["i", "ш"], ["o", "щ"], ["p", "з"],
  ["[", "х"], ["]", "ъ"], ["a", "ф"], ["s", "ы"], ["d", "в"], ["f", "а"], ["g", "п"], ["h", "р"], ["j", "о"], ["k", "л"],
  ["l", "д"], [";", "ж"], ["'", "э"], ["z", "я"], ["x", "ч"], ["c", "с"], ["v", "м"], ["b", "и"], ["n", "т"], ["m", "ь"],
  [",", "б"], [".", "ю"]
] as const;

const engToRuKeyboardMap = new Map<string, string>(keyboardMapPairs);
const ruToEngKeyboardMap = new Map<string, string>(keyboardMapPairs.map(([eng, ru]) => [ru, eng]));

const tokenVariantGroups = [
  ["pil", "pils", "pilsen", "pilsner", "pilsener", "пилс", "пилснер", "пилсен", "пильзнер", "пильзен", "пильзенер", "пилзнер", "пильсен", "пилзен", "пилзенер"],
  ["wit", "witbier", "blanche", "бланш", "вит", "витбир"],
  ["kolsch", "kölsch", "kelsch", "кельш"],
  ["hazy", "hazy ipa", "neipa", "new england", "new england ipa", "хейзи", "неипа", "нэипа"]
] as const;

const styleAliasMap: Record<string, string[]> = {
  "5B": ["kolsch", "kölsch", "кельш"],
  "10A": ["weissbier", "weizen", "вайцен", "вайценбир", "hefeweizen"],
  "10B": ["dunkelweizen", "dunkles weissbier", "тёмный вайцен", "дункельвайцен"],
  "10C": ["weizenbock", "вайценбок"],
  "12C": ["english ipa"],
  "21A": ["american ipa", "west coast ipa"],
  "21C": ["hazy ipa", "new england ipa", "new england", "neipa", "неипа", "нэипа"],
  "21B": ["specialty ipa", "специальный ipa"],
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
  "23G": ["gose", "гозе"],
  "27B": ["gueuze", "геуз"],
  "23E": ["gueuze", "геуз"],
  "27C": ["lambic", "ламбик"],
  "23D": ["lambic", "ламбик"],
  "27D": ["fruit lambic", "fruit lambiek", "фруктовый ламбик"],
  "23F": ["fruit lambic", "fruit lambiek", "фруктовый ламбик"],
  "31A": ["alternative grain beer", "альтернативные зерновые"],
  "32A": ["kvass", "квас"],
  "27-Piwo-Grodziskie": ["piwo grodziskie", "grätzer", "гродзиское", "гродзиский"],
  "X5": ["piwo grodziskie", "grätzer", "гродзиское", "гродзиский"]
};

export const foldBjcpSearchDiacritics = (value: string) => value
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replaceAll("ß", "ss");

export const normalizeBjcpSearchText = (input: string) => input
  .normalize("NFKC")
  .toLowerCase()
  .replaceAll("ё", "е")
  .replace(punctuationRegex, " ")
  .replace(separatorRegex, " ")
  .replace(whitespaceRegex, " ")
  .trim();

const dedupe = (values: Array<string | null | undefined>) => {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const value of values) {
    const normalized = normalizeBjcpSearchText(foldBjcpSearchDiacritics(value ?? ""));
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    out.push(value!.trim());
  }

  return out;
};

const transliterateRuToLat = (input: string) => normalizeBjcpSearchText(input)
  .split("")
  .map((char) => ruToLatMap[char] ?? char)
  .join("");

const transliterateLatToRu = (input: string) => {
  const source = normalizeBjcpSearchText(input);
  let index = 0;
  let out = "";

  while (index < source.length) {
    let matched = false;

    for (const [token, replacement] of latToRuTokens) {
      if (!source.startsWith(token, index)) {
        continue;
      }

      out += replacement;
      index += token.length;
      matched = true;
      break;
    }

    if (!matched) {
      out += source[index];
      index += 1;
    }
  }

  return normalizeBjcpSearchText(out);
};

const swapKeyboardLayout = (input: string) => {
  const source = normalizeBjcpSearchText(input);
  const looksRussian = /[а-я]/.test(source);
  const directMap = looksRussian ? ruToEngKeyboardMap : engToRuKeyboardMap;

  return normalizeBjcpSearchText(
    source
      .split("")
      .map((char) => directMap.get(char) ?? char)
      .join("")
  );
};

const applyTokenVariants = (value: string) => {
  const normalized = normalizeBjcpSearchText(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);
  const words = normalized.split(" ");

  for (const group of tokenVariantGroups) {
    for (let index = 0; index < words.length; index += 1) {
      const token = words[index];
      const matchesGroup = group.some((entry) => (
        entry === token
        || (token.length >= 3 && entry.startsWith(token))
        || (entry.length >= 4 && token.startsWith(entry))
      ));

      if (!matchesGroup) {
        continue;
      }

      for (const replacement of group) {
        const next = [...words];
        next[index] = replacement;
        variants.add(normalizeBjcpSearchText(next.join(" ")));
      }
    }

    for (const phrase of group.filter((item) => item.includes(" "))) {
      if (!normalized.includes(phrase)) {
        continue;
      }

      for (const replacement of group) {
        variants.add(normalizeBjcpSearchText(normalized.replaceAll(phrase, replacement)));
      }
    }
  }

  return [...variants].filter(Boolean);
};

const addQueryVariant = (variants: Set<string>, value: string) => {
  const normalized = normalizeBjcpSearchText(value);
  if (!normalized || variants.has(normalized) || variants.size >= 16) {
    return;
  }

  variants.add(normalized);
};

export const buildBjcpQueryVariants = (query: string) => {
  const variants = new Set<string>();
  const base = normalizeBjcpSearchText(query);
  if (!base) {
    return [];
  }

  for (const variant of applyTokenVariants(base)) {
    addQueryVariant(variants, variant);
  }

  const layoutSwap = swapKeyboardLayout(query);
  if (layoutSwap !== base) {
    for (const variant of applyTokenVariants(layoutSwap)) {
      addQueryVariant(variants, variant);
    }
  }

  const ruToLat = transliterateRuToLat(base);
  if (ruToLat !== base) {
    for (const variant of applyTokenVariants(ruToLat)) {
      addQueryVariant(variants, variant);
    }
  }

  const latToRu = transliterateLatToRu(base);
  if (latToRu !== base) {
    for (const variant of applyTokenVariants(latToRu)) {
      addQueryVariant(variants, variant);
    }
  }

  return [...variants];
};

export const scoreBjcpSearchText = (
  candidate: string,
  variant: string,
  exactScore: number,
  prefixScore: number,
  containsScore: number
) => {
  const normalizedCandidate = normalizeBjcpSearchText(foldBjcpSearchDiacritics(candidate));
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

const getAliasKeys = (style: BjcpStyleSearchEntry) => dedupe([
  style.id,
  style.bjcpId,
  style.styleKey
]);

const getPrimaryName = (style: BjcpStyleSearchEntry) => (
  style.nameRu
  ?? style.title
  ?? style.name
  ?? style.nameEn
  ?? style.titleEn
  ?? style.bjcpId
);

const getEnglishName = (style: BjcpStyleSearchEntry) => (
  style.nameEn
  ?? style.titleEn
  ?? style.name
  ?? null
);

const buildSearchTerms = (style: BjcpStyleSearchEntry) => {
  const aliasKeys = getAliasKeys(style);
  const explicitAliases = aliasKeys.flatMap((key) => styleAliasMap[key] ?? []);
  const englishName = getEnglishName(style);

  return {
    exact: dedupe([
      style.id,
      style.bjcpId,
      style.styleKey,
      style.name,
      style.nameRu,
      style.nameEn,
      style.title,
      style.titleEn,
      englishName ? foldBjcpSearchDiacritics(englishName) : null,
      ...(style.searchAliases ?? []),
      ...explicitAliases
    ]),
    family: dedupe([
      style.family,
      style.familyRu,
      style.familyNameRu,
      style.familyNameEn,
      ...(style.familyNamesRu ?? []),
      ...(style.familyNamesEn ?? [])
    ]),
    category: dedupe([
      style.categoryId,
      style.categoryNameRu
    ]),
    badges: style.badgesRu ?? []
  };
};

export const scoreBjcpStyle = (style: BjcpStyleSearchEntry, query: string) => {
  const variants = buildBjcpQueryVariants(foldBjcpSearchDiacritics(query));
  let score = 0;
  const terms = buildSearchTerms(style);

  for (const variant of variants) {
    score = Math.max(score, scoreBjcpSearchText(style.bjcpId, variant, 1200, 980, 0));
    if (style.styleKey) {
      score = Math.max(score, scoreBjcpSearchText(style.styleKey, variant, 1180, 940, 0));
    }

    for (const candidate of terms.exact) {
      score = Math.max(score, scoreBjcpSearchText(candidate, variant, 1100, 860, 720));
    }

    for (const candidate of terms.family) {
      score = Math.max(score, scoreBjcpSearchText(candidate, variant, 420, 360, 280));
    }

    for (const candidate of terms.category) {
      score = Math.max(score, scoreBjcpSearchText(candidate, variant, 380, 320, 240));
    }

    for (const candidate of terms.badges) {
      score = Math.max(score, scoreBjcpSearchText(candidate, variant, 260, 220, 180));
    }
  }

  return score;
};

export const searchBjcpStyles = <T extends BjcpStyleSearchEntry>(
  styles: T[],
  query: string,
  options: { limit?: number } = {}
): Array<BjcpStyleSearchResult<T>> => {
  const trimmed = query.trim();
  if (!trimmed) {
    return styles.map((item) => ({ item, score: 0 }));
  }

  const results = styles
    .map((item) => ({ item, score: scoreBjcpStyle(item, trimmed) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score);

  return typeof options.limit === "number" ? results.slice(0, options.limit) : results;
};

export const getBjcpStyleDisplayName = (style: BjcpStyleSearchEntry) => getPrimaryName(style);
