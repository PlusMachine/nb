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

/**
 * Нормализация текста для поиска: NFKC, нижний регистр, ё→е, пунктуация/
 * сепараторы → пробел, схлопывание пробелов. БИТ-В-БИТ прежнее поведение —
 * в БД лежат предвычисленные normalized-поля (aliasNormalized и т.п.),
 * менять семантику нельзя. Диакритику НЕ фолдит — см. {@link foldSearchDiacritics}.
 */
export const normalizeSearchText = (input: string) => input
  .normalize("NFKC")
  .toLowerCase()
  .replaceAll("ё", "е")
  .replace(punctuationRegex, " ")
  .replace(separatorRegex, " ")
  .replace(whitespaceRegex, " ")
  .trim();

/** Фолдинг диакритики (Kölsch → kolsch, ß → ss) — NFKD + удаление combining marks. */
export const foldSearchDiacritics = (input: string) => input
  .normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "")
  .replaceAll("ß", "ss");

export const transliterateRuToLat = (input: string) => normalizeSearchText(input)
  .split("")
  .map((char) => ruToLatMap[char] ?? char)
  .join("");

export const transliterateLatToRu = (input: string) => {
  const source = normalizeSearchText(input);
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

  return normalizeSearchText(out);
};

/**
 * Смена раскладки (eng↔рус). Маппит буквы ДО нормализации: половина клавиш
 * раскладки — пунктуация (",;'[]"), которую normalizeSearchText вырезает.
 */
export const swapKeyboardLayout = (input: string) => {
  const source = input.normalize("NFKC").toLowerCase();
  const looksRussian = /[а-яё]/.test(source);
  const directMap = looksRussian ? ruToEngKeyboardMap : engToRuKeyboardMap;

  return normalizeSearchText(
    source
      .split("")
      .map((char) => directMap.get(char) ?? char)
      .join("")
  );
};

export const applyTokenVariantGroups = (
  value: string,
  groups: ReadonlyArray<ReadonlyArray<string>>
): string[] => {
  const normalized = normalizeSearchText(value);
  if (!normalized) {
    return [];
  }

  const variants = new Set<string>([normalized]);
  const words = normalized.split(" ");

  for (const group of groups) {
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
        variants.add(normalizeSearchText(next.join(" ")));
      }
    }

    for (const phrase of group.filter((item) => item.includes(" "))) {
      if (!normalized.includes(phrase)) {
        continue;
      }

      for (const replacement of group) {
        variants.add(normalizeSearchText(normalized.replaceAll(phrase, replacement)));
      }
    }
  }

  return [...variants].filter(Boolean);
};

const emptyGroups: ReadonlyArray<ReadonlyArray<string>> = [];
const maxQueryVariants = 16;

export type BuildSearchQueryVariantsOptions = {
  /** Домен-специфичные группы синонимов (семейства ингредиентов, стилевые алиасы и т.п.). */
  tokenVariantGroups?: ReadonlyArray<ReadonlyArray<string>>;
  /** Подмешивать варианты со сменённой раскладкой в общий набор. По умолчанию выключено — раскладка это фолбэк. */
  includeLayoutVariants?: boolean;
};

/**
 * Единый построитель вариантов запроса: base → (опционально) раскладка →
 * транслит ru→lat → транслит lat→ru. Кап 16 вариантов.
 */
export const buildSearchQueryVariants = (
  query: string,
  options: BuildSearchQueryVariantsOptions = {}
): string[] => {
  const groups = options.tokenVariantGroups ?? emptyGroups;
  const includeLayoutVariants = options.includeLayoutVariants ?? false;

  const variants = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeSearchText(value);
    if (!normalized || variants.has(normalized) || variants.size >= maxQueryVariants) {
      return;
    }

    variants.add(normalized);
  };

  const base = normalizeSearchText(query);
  if (!base) {
    return [];
  }

  for (const variant of applyTokenVariantGroups(base, groups)) {
    add(variant);
  }

  if (includeLayoutVariants) {
    const layoutSwap = swapKeyboardLayout(query);
    if (layoutSwap !== base) {
      for (const variant of applyTokenVariantGroups(layoutSwap, groups)) {
        add(variant);
      }
    }
  }

  const ruToLat = transliterateRuToLat(base);
  if (ruToLat !== base) {
    for (const variant of applyTokenVariantGroups(ruToLat, groups)) {
      add(variant);
    }
  }

  const latToRu = transliterateLatToRu(base);
  if (latToRu !== base) {
    for (const variant of applyTokenVariantGroups(latToRu, groups)) {
      add(variant);
    }
  }

  return [...variants];
};

// % и _ — служебные символы Postgres LIKE/ILIKE (wildcard и single-char match),
// экранируем их В САМОМ варианте до подстановки в шаблон `%...%` — backslash
// дефолтный ESCAPE в Postgres.
export const escapeLikePattern = (value: string) => value.replace(/[\\%_]/g, "\\$&");

export type BuildLayoutQueryVariantsOptions = {
  tokenVariantGroups?: ReadonlyArray<ReadonlyArray<string>>;
};

// Раскладочный фолбэк («lf,tk» вместо «дуббель») — путь спасения, а не
// первоклассный вариант: применённый к каждому запросу, он превращает «дуб»
// в «le» и топит выдачу мусорными подстроками. Поэтому отдельный builder,
// который вызывающая сторона гоняет вторым проходом только при нуле
// результатов первого.
export const buildLayoutQueryVariants = (
  query: string,
  options: BuildLayoutQueryVariantsOptions = {}
): string[] => {
  const groups = options.tokenVariantGroups ?? emptyGroups;
  const base = normalizeSearchText(query);
  const layoutSwap = swapKeyboardLayout(query);
  if (!base || !layoutSwap || layoutSwap === base) {
    return [];
  }

  const variants = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeSearchText(value);
    if (!normalized || variants.has(normalized) || variants.size >= maxQueryVariants) {
      return;
    }

    variants.add(normalized);
  };

  for (const variant of applyTokenVariantGroups(layoutSwap, groups)) {
    add(variant);
  }

  const latToRu = transliterateLatToRu(layoutSwap);
  if (latToRu !== layoutSwap) {
    for (const variant of applyTokenVariantGroups(latToRu, groups)) {
      add(variant);
    }
  }

  return [...variants].filter((variant) => variant !== base);
};
