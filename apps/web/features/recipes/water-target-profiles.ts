import { getBeerStyleById, type WaterProfile } from "@nb/brewing-core";

import seed from "../../../../ingredients/new/water_target_profiles_seed_v4_audited.json";

type SeedWaterProfile = {
  slug: string;
  name: string;
  name_ru?: string | null;
  profile_group?: string | null;
  canonical_target_ppm: {
    ca: number | null;
    mg: number | null;
    na: number | null;
    cl: number | null;
    so4: number | null;
    hco3: number | null;
  };
  description?: string | null;
  is_quick_pick?: boolean | null;
  quick_pick_rank?: number | null;
  display_priority?: number | null;
  picker?: {
    picker_name?: string | null;
    picker_name_ru?: string | null;
    display_priority?: number | null;
    quick_pick_rank?: number | null;
  } | null;
  aliases?: {
    en?: string[];
    ru?: string[];
  } | null;
  profile_search_aliases_en?: string[];
  profile_search_aliases_ru?: string[];
  intent_search_aliases_en?: string[];
  intent_search_aliases_ru?: string[];
  style_family_aliases_en?: string[];
  style_family_aliases_ru?: string[];
  source_search_aliases_en?: string[];
  source_search_aliases_ru?: string[];
};

type SeedBjcpDefault = {
  style_key: string;
  bjcp_code: string;
  bjcp_name_en: string;
  bjcp_name_ru?: string | null;
  default_profile_slug: string;
  alternative_profile_slugs?: string[];
  quick_pick_profile_slugs?: string[];
  auto_select_default_profile?: boolean;
  profile_selection_type?: string;
  search_aliases_en?: string[];
  search_aliases_ru?: string[];
  style_search_aliases_en?: string[];
  style_search_aliases_ru?: string[];
  style_family_terms_en?: string[];
  style_family_terms_ru?: string[];
};

type SeedQuickPick = {
  rank: number;
  profile_slug: string;
  picker_name?: string | null;
  picker_name_ru?: string | null;
  short_name?: string | null;
  short_name_ru?: string | null;
  search_terms_en?: string[];
  search_terms_ru?: string[];
};

type WaterTargetSeed = {
  profiles: SeedWaterProfile[];
  bjcp_style_defaults: SeedBjcpDefault[];
  quick_pick_profiles: SeedQuickPick[];
};

export type WaterTargetProfileCatalogItem = {
  slug: string;
  name: string;
  nameRu: string;
  displayName: string;
  group: string;
  badge: string;
  description: string | null;
  profile: WaterProfile;
  isQuickPick: boolean;
  quickPickRank: number | null;
  displayPriority: number;
  search: {
    high: string[];
    medium: string[];
    low: string[];
  };
};

export type WaterTargetStyleDefault = {
  styleKey: string;
  bjcpCode: string;
  bjcpName: string;
  defaultProfile: WaterTargetProfileCatalogItem | null;
  alternativeProfiles: WaterTargetProfileCatalogItem[];
  isContextual: boolean;
  autoSelectDefault: boolean;
};

const typedSeed = seed as WaterTargetSeed;

const groupLabels: Record<string, string> = {
  general_template: "Базовый профиль",
  brewery_reference: "Пивоварня",
  author_reference: "Авторский",
  historical_reference: "Исторический",
  city_reference: "Исторический",
  contextual: "По базовому стилю",
};

const normalizeSearchText = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-я0-9]+/giu, " ")
    .trim();

const uniqueStrings = (items: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = normalizeSearchText(item ?? "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
};

const toWaterProfile = (
  profile: SeedWaterProfile["canonical_target_ppm"],
): WaterProfile => ({
  ca: profile.ca ?? 0,
  mg: profile.mg ?? 0,
  na: profile.na ?? 0,
  cl: profile.cl ?? 0,
  so4: profile.so4 ?? 0,
  hco3: profile.hco3 ?? 0,
  ph: null,
});

const toCatalogItem = (
  profile: SeedWaterProfile,
): WaterTargetProfileCatalogItem => {
  const pickerName = profile.picker?.picker_name_ru ?? profile.picker?.picker_name;
  const nameRu = profile.name_ru ?? profile.name;

  return {
    slug: profile.slug,
    name: profile.name,
    nameRu,
    displayName: pickerName ?? nameRu,
    group: profile.profile_group ?? "general_template",
    badge: groupLabels[profile.profile_group ?? ""] ?? "Профиль",
    description: profile.description ?? null,
    profile: toWaterProfile(profile.canonical_target_ppm),
    isQuickPick: Boolean(profile.is_quick_pick ?? profile.picker?.quick_pick_rank),
    quickPickRank: profile.quick_pick_rank ?? profile.picker?.quick_pick_rank ?? null,
    displayPriority:
      profile.display_priority ?? profile.picker?.display_priority ?? 0,
    search: {
      high: uniqueStrings([
        profile.name,
        nameRu,
        profile.slug,
        ...(profile.profile_search_aliases_en ?? []),
        ...(profile.profile_search_aliases_ru ?? []),
        ...(profile.aliases?.en ?? []),
        ...(profile.aliases?.ru ?? []),
      ]),
      medium: uniqueStrings([
        ...(profile.intent_search_aliases_en ?? []),
        ...(profile.intent_search_aliases_ru ?? []),
        ...(profile.style_family_aliases_en ?? []),
        ...(profile.style_family_aliases_ru ?? []),
      ]),
      low: uniqueStrings([
        ...(profile.source_search_aliases_en ?? []),
        ...(profile.source_search_aliases_ru ?? []),
        profile.description ?? "",
      ]),
    },
  };
};

export const waterTargetProfileCatalog = typedSeed.profiles.map(toCatalogItem);

const profilesBySlug = new Map(
  waterTargetProfileCatalog.map((profile) => [profile.slug, profile] as const),
);
const mappingsByStyleKey = new Map(
  typedSeed.bjcp_style_defaults.map((mapping) => [mapping.style_key, mapping] as const),
);

const resolveProfiles = (slugs: string[] = []) => {
  const seen = new Set<string>();
  const profiles: WaterTargetProfileCatalogItem[] = [];

  for (const slug of slugs) {
    if (seen.has(slug)) {
      continue;
    }

    const profile = profilesBySlug.get(slug);
    if (!profile) {
      continue;
    }

    seen.add(slug);
    profiles.push(profile);
  }

  return profiles;
};

const slugify = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

const resolveStyleKeyByName = (bjcpCode: string, styleName: string) => {
  const normalizedName = normalizeSearchText(styleName);
  const candidates = typedSeed.bjcp_style_defaults.filter(
    (mapping) => mapping.bjcp_code === bjcpCode,
  );

  return (
    candidates.find((mapping) =>
      normalizeSearchText(mapping.bjcp_name_en).endsWith(normalizedName),
    )?.style_key ??
    candidates.find((mapping) =>
      normalizeSearchText(mapping.bjcp_name_en).includes(normalizedName),
    )?.style_key ??
    null
  );
};

export const resolveWaterTargetBjcpStyleKey = (
  styleId: string | null | undefined,
) => {
  const style = getBeerStyleById(styleId);
  if (!style || style.bjcpId === "LEGACY") {
    return null;
  }

  const styleNameSlug = slugify(style.name);
  const candidates = [
    style.id,
    `${style.bjcpId}-${styleNameSlug}`,
    styleNameSlug.endsWith("-ipa")
      ? `${style.bjcpId}-${styleNameSlug.replace(/-ipa$/u, "")}`
      : null,
    resolveStyleKeyByName(style.bjcpId, style.name),
    style.bjcpId,
  ].filter(Boolean) as string[];

  return candidates.find((candidate) => mappingsByStyleKey.has(candidate)) ?? null;
};

export const getWaterTargetProfileBySlug = (
  slug: string | null | undefined,
) => (slug ? profilesBySlug.get(slug) ?? null : null);

export const getDefaultTargetProfileForBjcpStyle = (
  styleKey: string | null | undefined,
) => {
  const mapping = styleKey ? mappingsByStyleKey.get(styleKey) : null;
  if (!mapping) {
    return null;
  }

  return getWaterTargetProfileBySlug(mapping.default_profile_slug);
};

export const getWaterTargetStyleDefault = (
  styleKey: string | null | undefined,
): WaterTargetStyleDefault | null => {
  const mapping = styleKey ? mappingsByStyleKey.get(styleKey) : null;
  if (!mapping) {
    return null;
  }

  const defaultProfile = getDefaultTargetProfileForBjcpStyle(styleKey);
  const alternativeProfiles = resolveProfiles([
    ...(mapping.quick_pick_profile_slugs ?? []),
    ...(mapping.alternative_profile_slugs ?? []),
  ]).filter((profile) => profile.slug !== defaultProfile?.slug);

  return {
    styleKey: mapping.style_key,
    bjcpCode: mapping.bjcp_code,
    bjcpName: mapping.bjcp_name_ru ?? mapping.bjcp_name_en,
    defaultProfile,
    alternativeProfiles,
    isContextual: mapping.profile_selection_type === "contextual",
    autoSelectDefault: mapping.auto_select_default_profile !== false,
  };
};

export const getAlternativeTargetProfilesForBjcpStyle = (
  styleKey: string | null | undefined,
) => getWaterTargetStyleDefault(styleKey)?.alternativeProfiles ?? [];

export const getWaterTargetQuickPickProfiles = (limit = 6) => {
  const slugs = typedSeed.quick_pick_profiles
    .slice()
    .sort((left, right) => left.rank - right.rank)
    .map((item) => item.profile_slug);

  return resolveProfiles(slugs).slice(0, limit);
};

const getFieldScore = (field: string, query: string, weight: number) => {
  if (field === query) {
    return weight + 300;
  }
  if (field.startsWith(query)) {
    return weight + 180;
  }
  if (field.includes(query)) {
    return weight;
  }
  return 0;
};

export const searchWaterTargetProfiles = (
  query: string,
  options: { limit?: number; excludeSlugs?: string[] } = {},
) => {
  const normalizedQuery = normalizeSearchText(query);
  const excluded = new Set(options.excludeSlugs ?? []);

  if (!normalizedQuery) {
    return waterTargetProfileCatalog
      .filter((profile) => !excluded.has(profile.slug))
      .slice()
      .sort(
        (left, right) =>
          right.displayPriority - left.displayPriority ||
          left.displayName.localeCompare(right.displayName, "ru"),
      )
      .slice(0, options.limit ?? waterTargetProfileCatalog.length);
  }

  return waterTargetProfileCatalog
    .filter((profile) => !excluded.has(profile.slug))
    .map((profile) => {
      const high = Math.max(
        0,
        ...profile.search.high.map((field) => getFieldScore(field, normalizedQuery, 700)),
      );
      const medium = Math.max(
        0,
        ...profile.search.medium.map((field) => getFieldScore(field, normalizedQuery, 420)),
      );
      const low = Math.max(
        0,
        ...profile.search.low.map((field) => getFieldScore(field, normalizedQuery, 160)),
      );

      return {
        profile,
        score: Math.max(high, medium, low),
      };
    })
    .filter((item) => item.score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.profile.displayPriority - left.profile.displayPriority ||
        left.profile.displayName.localeCompare(right.profile.displayName, "ru"),
    )
    .slice(0, options.limit ?? waterTargetProfileCatalog.length)
    .map((item) => item.profile);
};
