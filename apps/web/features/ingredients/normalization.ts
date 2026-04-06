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

const normalizeAndCollapse = (value: string) => value
  .normalize("NFKC")
  .toLowerCase()
  .replaceAll("ё", "е")
  .replace(punctuationRegex, " ")
  .replace(separatorRegex, " ")
  .replace(whitespaceRegex, " ")
  .trim();

const applyTokenVariants = (value: string) => {
  const normalized = normalizeAndCollapse(value);
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
        variants.add(normalizeAndCollapse(next.join(" ")));
      }
    }

    for (const phrase of group.filter((item) => item.includes(" "))) {
      if (!normalized.includes(phrase)) {
        continue;
      }

      for (const replacement of group) {
        variants.add(normalizeAndCollapse(normalized.replaceAll(phrase, replacement)));
      }
    }
  }

  return [...variants].filter(Boolean);
};

const tokenizeSearchTextPreservingRaw = (value: string) => value
  .normalize("NFKC")
  .replaceAll("ё", "е")
  .replace(punctuationRegex, " ")
  .replace(separatorRegex, " ")
  .replace(whitespaceRegex, " ")
  .trim()
  .split(" ")
  .map((token) => token.trim())
  .filter(Boolean);

export const normalizeSearchText = (input: string) => normalizeAndCollapse(input);

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

export const swapKeyboardLayout = (input: string) => {
  const source = normalizeSearchText(input);
  const looksRussian = /[а-я]/.test(source);
  const directMap = looksRussian ? ruToEngKeyboardMap : engToRuKeyboardMap;

  return normalizeSearchText(
    source
      .split("")
      .map((char) => directMap.get(char) ?? char)
      .join("")
  );
};

export const buildQueryVariants = (query: string) => {
  const variants = new Set<string>();
  const add = (value: string) => {
    const normalized = normalizeSearchText(value);
    if (!normalized || variants.has(normalized) || variants.size >= 16) {
      return;
    }

    variants.add(normalized);
  };

  const base = normalizeSearchText(query);
  if (!base) {
    return [];
  }

  for (const variant of applyTokenVariants(base)) {
    add(variant);
  }

  const layoutSwap = swapKeyboardLayout(query);
  if (layoutSwap !== base) {
    for (const variant of applyTokenVariants(layoutSwap)) {
      add(variant);
    }
  }

  const ruToLat = transliterateRuToLat(base);
  if (ruToLat !== base) {
    for (const variant of applyTokenVariants(ruToLat)) {
      add(variant);
    }
  }

  const latToRu = transliterateLatToRu(base);
  if (latToRu !== base) {
    for (const variant of applyTokenVariants(latToRu)) {
      add(variant);
    }
  }

  return [...variants];
};

const isCoveredByManufacturerPhrase = (queryVariant: string, manufacturerVariant: string) => {
  if (!queryVariant || !manufacturerVariant) {
    return false;
  }

  return queryVariant === manufacturerVariant
    || (queryVariant.length >= 2 && manufacturerVariant.startsWith(queryVariant))
    || (manufacturerVariant.length >= 2 && queryVariant.startsWith(manufacturerVariant));
};

const isManufacturerLikeToken = (token: string, manufacturerTokens: string[]) => {
  const tokenVariants = buildQueryVariants(token);

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

  const queryVariants = buildQueryVariants(query);
  const manufacturerVariants = buildQueryVariants(manufacturer);

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
