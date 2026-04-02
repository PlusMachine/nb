import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  listArticleCategories,
  listArticles,
  type CategorySummary,
  type ContentArticle
} from "./bjcp";

const moduleDir = dirname(fileURLToPath(import.meta.url));
const BJCP_FAMILY_FILE_CANDIDATES = [
  resolve(moduleDir, "../../../ingredients/bjcp/bjcp_style_families_ru_v2.json"),
  resolve(moduleDir, "../../../ingredients/bjcp/bjcp_style_families_ru.json")
];

type RawBjcpFamilyFile = {
  ui_strategy?: {
    default_view?: string;
    secondary_view?: string;
    recommended_quick_chips_ru?: string[];
    recommended_advanced_filters_ru?: string[];
    notes_ru?: string[];
  };
  families?: Array<{
    id?: string;
    name_ru?: string;
    name_en?: string;
    description_ru?: string;
    sort_order?: number;
    style_count?: number;
    primary_style_count?: number;
    style_ids?: string[];
    style_names_ru?: string[];
    cross_listed_style_ids?: string[];
    has_cross_listings?: boolean;
  }>;
  styles?: Array<{
    bjcp_id?: string;
    name_ru?: string;
    name_en?: string;
    category_id?: string;
    category_ru?: string;
    primary_family_id?: string;
    primary_family_ru?: string;
    primary_family_en?: string;
    ui_badges_ru?: string[];
    ui_color_hint?: string;
    secondary_family_ids?: string[];
    all_family_ids?: string[];
  }>;
};

const bjcpUiColorHints = [
  "autumn-amber",
  "blended-spectrum",
  "declared-spectrum",
  "experimental-spectrum",
  "fruit-spectrum",
  "fruit-spice-spectrum",
  "grain-harvest",
  "hop-spectrum",
  "lager-hazy",
  "smoke-malt",
  "sour-spectrum",
  "spice-garden",
  "sugar-caramel",
  "wild-ale-spectrum",
  "winter-spice",
  "wood-barrel"
] as const;

export type BjcpUiColorHint = typeof bjcpUiColorHints[number];

export type BjcpCatalogViewMode = "families" | "bjcp";

export type BjcpCatalogUiStrategy = {
  defaultView: BjcpCatalogViewMode;
  secondaryView: BjcpCatalogViewMode;
  quickChipsRu: string[];
  advancedFiltersRu: string[];
  notesRu: string[];
};

export type BjcpFamily = {
  id: string;
  nameRu: string;
  nameEn: string;
  descriptionRu: string;
  sortOrder: number;
  styleCount: number;
  primaryStyleCount: number;
  styleIds: string[];
  crossListedStyleIds: string[];
  hasCrossListings: boolean;
};

export type BjcpCatalogStyle = ContentArticle & {
  categoryId: string;
  categoryNameRu: string;
  familyId: string;
  familyNameRu: string;
  familyNameEn: string;
  familyIds: string[];
  familyNamesRu: string[];
  familyNamesEn: string[];
  badgesRu: string[];
  uiColorHint: BjcpUiColorHint | null;
};

export type BjcpCatalogData = {
  uiStrategy: BjcpCatalogUiStrategy;
  families: BjcpFamily[];
  categories: CategorySummary[];
  styles: BjcpCatalogStyle[];
};

const defaultUiStrategy: BjcpCatalogUiStrategy = {
  defaultView: "families",
  secondaryView: "bjcp",
  quickChipsRu: [],
  advancedFiltersRu: [],
  notesRu: []
};

let cachedCatalogPromise: Promise<BjcpCatalogData> | null = null;

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });
const bjcpUiColorHintSet = new Set<string>(bjcpUiColorHints);

const compareBjcpIds = (left: string, right: string) => collator.compare(left, right);

const normalizeUiColorHint = (value?: string | null): BjcpUiColorHint | null => (
  value && bjcpUiColorHintSet.has(value) ? value as BjcpUiColorHint : null
);

const loadFamilyFile = async (): Promise<RawBjcpFamilyFile> => {
  for (const filePath of BJCP_FAMILY_FILE_CANDIDATES) {
    try {
      const raw = await readFile(filePath, "utf8");
      return JSON.parse(raw) as RawBjcpFamilyFile;
    } catch {
      continue;
    }
  }

  return {};
};

const normalizeUiStrategy = (value?: RawBjcpFamilyFile["ui_strategy"]): BjcpCatalogUiStrategy => ({
  defaultView: value?.default_view === "bjcp_categories" || value?.default_view === "bjcp" ? "bjcp" : "families",
  secondaryView: value?.secondary_view === "bjcp_categories" || value?.secondary_view === "bjcp" ? "bjcp" : "bjcp",
  quickChipsRu: value?.recommended_quick_chips_ru?.filter(Boolean) ?? defaultUiStrategy.quickChipsRu,
  advancedFiltersRu: value?.recommended_advanced_filters_ru?.filter(Boolean) ?? defaultUiStrategy.advancedFiltersRu,
  notesRu: value?.notes_ru?.filter(Boolean) ?? defaultUiStrategy.notesRu
});

const buildCatalog = async (): Promise<BjcpCatalogData> => {
  const [articles, categories, familyFile] = await Promise.all([
    listArticles(),
    listArticleCategories(),
    loadFamilyFile()
  ]);
  const availableArticleIds = new Set(articles.map((article) => article.bjcpId));

  const styleMetaById = new Map(
    (familyFile.styles ?? [])
      .filter((style) => style.bjcp_id?.trim())
      .map((style) => [style.bjcp_id!.trim(), style])
  );

  const families: BjcpFamily[] = (familyFile.families ?? [])
    .filter((family) => family.id?.trim() && family.name_ru?.trim())
    .map((family) => {
      const declaredStyleIds = (family.style_ids ?? []).filter(Boolean).sort(compareBjcpIds);
      const styleIds = declaredStyleIds.filter((styleId) => availableArticleIds.has(styleId));

      return {
        id: family.id!.trim(),
        nameRu: family.name_ru!.trim(),
        nameEn: family.name_en?.trim() ?? family.name_ru!.trim(),
        descriptionRu: family.description_ru?.trim() ?? "",
        sortOrder: Number.isFinite(family.sort_order) ? Number(family.sort_order) : 999,
        styleCount: styleIds.length,
        primaryStyleCount: Math.min(family.primary_style_count ?? styleIds.length, styleIds.length),
        styleIds,
        crossListedStyleIds: (family.cross_listed_style_ids ?? [])
          .filter(Boolean)
          .filter((styleId) => availableArticleIds.has(styleId))
          .sort(compareBjcpIds),
        hasCrossListings: Boolean((family.cross_listed_style_ids ?? []).some((styleId) => availableArticleIds.has(styleId)))
      };
    })
    .sort((left, right) => left.sortOrder - right.sortOrder);

  const familyById = new Map(families.map((family) => [family.id, family]));

  const styles: BjcpCatalogStyle[] = articles.map((article) => {
    const meta = styleMetaById.get(article.bjcpId);
    const primaryFamilyId = meta?.primary_family_id?.trim()
      ?? families.find((family) => family.styleIds.includes(article.bjcpId))?.id
      ?? article.category.id;

    const familyIds = Array.from(new Set([
      primaryFamilyId,
      ...(meta?.all_family_ids ?? []).map((familyId) => familyId?.trim()).filter(Boolean) as string[]
    ]))
      .filter((familyId) => familyById.has(familyId) || familyId === primaryFamilyId);

    const familyNamesRu = familyIds
      .map((familyId) => familyById.get(familyId)?.nameRu ?? null)
      .filter((value): value is string => value !== null);
    const familyNamesEn = familyIds
      .map((familyId) => familyById.get(familyId)?.nameEn ?? null)
      .filter((value): value is string => value !== null);

    return {
      ...article,
      categoryId: meta?.category_id?.trim() ?? article.category.id,
      categoryNameRu: meta?.category_ru?.trim() ?? article.category.nameRu,
      familyId: primaryFamilyId,
      familyNameRu: familyById.get(primaryFamilyId)?.nameRu ?? meta?.primary_family_ru?.trim() ?? article.category.nameRu,
      familyNameEn: familyById.get(primaryFamilyId)?.nameEn ?? meta?.primary_family_en?.trim() ?? article.category.nameEn,
      familyIds: familyIds.length ? familyIds : [primaryFamilyId],
      familyNamesRu: familyNamesRu.length ? familyNamesRu : [familyById.get(primaryFamilyId)?.nameRu ?? article.category.nameRu],
      familyNamesEn: familyNamesEn.length ? familyNamesEn : [familyById.get(primaryFamilyId)?.nameEn ?? article.category.nameEn],
      badgesRu: meta?.ui_badges_ru?.filter(Boolean) ?? [],
      uiColorHint: normalizeUiColorHint(meta?.ui_color_hint)
    };
  });

  return {
    uiStrategy: normalizeUiStrategy(familyFile.ui_strategy),
    families,
    categories,
    styles: styles.sort((left, right) => compareBjcpIds(left.bjcpId, right.bjcpId))
  };
};

export const getBjcpCatalogData = async () => {
  cachedCatalogPromise ??= buildCatalog();
  return cachedCatalogPromise;
};
