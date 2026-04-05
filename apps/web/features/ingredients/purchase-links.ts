import type {
  IngredientPurchaseLinkDto,
  IngredientPurchaseLinkMarketplace
} from "./contracts";

const purchaseLinkMarketplaceDomains: Record<IngredientPurchaseLinkMarketplace, string[]> = {
  ozon: ["ozon.ru"],
  wildberries: ["wildberries.ru", "wb.ru"],
  avito: ["avito.ru"],
  yandex_market: ["market.yandex.ru", "yandex.market"],
  russkaya_dymka: ["rdshop.ru", "xn--80aalwclyias7g0b.xn--p1ai", "русскаядымка.рф"],
  kolba: ["kolba.ru"],
  birrf: ["xn--90aoy.xn--p1ai", "бир.рф"],
  other: []
};

const ingredientPurchaseLinkDisplayHosts: Partial<Record<IngredientPurchaseLinkMarketplace, string>> = {
  ozon: "ozon.ru",
  wildberries: "wildberries.ru",
  avito: "avito.ru",
  yandex_market: "market.yandex.ru",
  russkaya_dymka: "rdshop.ru",
  kolba: "kolba.ru",
  birrf: "бир.рф"
};

export const ingredientPurchaseLinkMarketplaceLabels: Record<IngredientPurchaseLinkMarketplace, string> = {
  ozon: "Ozon",
  wildberries: "Wildberries",
  avito: "Avito",
  yandex_market: "Яндекс Маркет",
  russkaya_dymka: "Русская Дымка",
  kolba: "Колба",
  birrf: "Бир.рф",
  other: "Другая площадка"
};

export const ingredientPurchaseLinkMarketplaceAbbreviations: Record<IngredientPurchaseLinkMarketplace, string> = {
  ozon: "O",
  wildberries: "WB",
  avito: "A",
  yandex_market: "YM",
  russkaya_dymka: "РД",
  kolba: "К",
  birrf: "Б",
  other: "•"
};

const stripWwwPrefix = (value: string) => value.replace(/^www\./i, "");

const stripTrailingSlash = (value: string) => (
  value.endsWith("/") ? value.slice(0, -1) : value
);

const matchesMarketplaceDomain = (host: string, domain: string) => (
  host === domain || host.endsWith(`.${domain}`)
);

const normalizeUrlString = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const withProtocol = /^[a-z][a-z0-9+\-.]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("INVALID_PURCHASE_LINK_URL");
  }

  url.hash = "";
  return stripTrailingSlash(url.toString());
};

export const normalizeIngredientPurchaseLinkInput = (value: string) => normalizeUrlString(value);

export const detectIngredientPurchaseMarketplaceByHost = (
  host: string
): IngredientPurchaseLinkMarketplace => {
  const normalizedHost = stripWwwPrefix(host.trim().toLowerCase());

  for (const [marketplace, domains] of Object.entries(purchaseLinkMarketplaceDomains) as Array<[IngredientPurchaseLinkMarketplace, string[]]>) {
    if (domains.some((domain) => matchesMarketplaceDomain(normalizedHost, domain))) {
      return marketplace;
    }
  }

  return "other";
};

export const buildIngredientPurchaseLinkView = (
  input: Pick<IngredientPurchaseLinkDto, "id" | "url" | "normalizedUrl" | "position">
): IngredientPurchaseLinkDto => {
  const normalizedUrl = normalizeIngredientPurchaseLinkInput(input.url);
  if (!normalizedUrl) {
    throw new Error("INVALID_PURCHASE_LINK_URL");
  }

  const parsed = new URL(normalizedUrl);
  const host = stripWwwPrefix(parsed.hostname.toLowerCase());
  const marketplace = detectIngredientPurchaseMarketplaceByHost(host);

  return {
    id: input.id,
    url: normalizedUrl,
    normalizedUrl: input.normalizedUrl || normalizedUrl,
    host,
    displayHost: ingredientPurchaseLinkDisplayHosts[marketplace] ?? host,
    marketplace,
    marketplaceLabel: ingredientPurchaseLinkMarketplaceLabels[marketplace],
    position: input.position
  };
};

export const normalizeIngredientPurchaseLinkInputs = (values: string[]) => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const value of values) {
    const nextValue = normalizeIngredientPurchaseLinkInput(value);
    if (!nextValue || seen.has(nextValue)) {
      continue;
    }

    seen.add(nextValue);
    normalized.push(nextValue);
  }

  return normalized;
};
