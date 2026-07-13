import {
  ingredientAliasLocales,
  type IngredientAliasDto,
  type IngredientAliasLocale,
  type IngredientPackageVariantDto
} from "./contracts";
import {
  ingredientCategorySubtypes,
  resolveIngredientSubtype,
  type IngredientCategory,
  type IngredientSubtype
} from "./taxonomy";

export type AdminIngredientFieldVisibility = {
  primary: string[];
  advanced: string[];
};

export const formatEnumLabel = (value: string) => value
  .split("_")
  .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
  .join(" ");

export const getAdminIngredientSubtypeOptions = (
  category: IngredientCategory
): readonly IngredientSubtype[] => ingredientCategorySubtypes[category];

export const getNextAdminIngredientTaxonomyState = (
  current: { category: IngredientCategory; subtype: IngredientSubtype | null },
  next: { category?: IngredientCategory; subtype?: string | null }
) => {
  if (next.category) {
    const category = next.category;
    const subtype = current.subtype && (ingredientCategorySubtypes[category] as readonly string[]).includes(current.subtype)
      ? current.subtype
      : ingredientCategorySubtypes[category][0] ?? null;

    return { category, subtype };
  }

  if (next.subtype) {
    const subtype = resolveIngredientSubtype({
      category: current.category,
      subtype: next.subtype
    });

    if (subtype && (ingredientCategorySubtypes[current.category] as readonly string[]).includes(subtype)) {
      return {
        category: current.category,
        subtype
      };
    }
  }

  return {
    category: current.category,
    subtype: ingredientCategorySubtypes[current.category][0] ?? null
  };
};

export const getAdminIngredientFieldVisibility = (
  category: IngredientCategory,
  subtype: IngredientSubtype | null
): AdminIngredientFieldVisibility => {
  if (category === "hop") {
    return {
      primary: ["names", "display", "aliases", "attributes"],
      advanced: ["sources"]
    };
  }

  if (category === "fermentable") {
    return {
      primary: ["names", "display", "aliases", "attributes"],
      advanced: ["sources", "quantity_defaults"]
    };
  }

  if (category === "yeast") {
    return {
      primary: ["names", "display", "aliases", "attributes"],
      advanced: ["sources"]
    };
  }

  if (category === "water_treatment") {
    return {
      primary: ["names", "display", "aliases", "attributes"],
      advanced: ["sources", "quantity_defaults", subtype === "acid" ? "unit_preview" : "unit_preview"]
    };
  }

  return {
    primary: ["names", "display", "aliases", "attributes"],
    advanced: ["sources", "quantity_defaults", "package_variants"]
  };
};

export const ingredientAliasLocaleLabels: Record<IngredientAliasLocale, string> = {
  ru: "Рус.",
  en: "Англ.",
  neutral: "Без языка"
};

export type AdminAliasRow = {
  id?: string;
  locale: IngredientAliasLocale;
  alias: string;
  source: string;
  isEnabled: boolean;
};

export const toAdminAliasRows = (aliases: IngredientAliasDto[] | undefined): AdminAliasRow[] => (
  (aliases ?? []).map((alias) => ({
    id: alias.id,
    locale: alias.locale,
    alias: alias.alias,
    source: alias.source ?? "admin",
    isEnabled: alias.isEnabled ?? true
  }))
);

export const createAdminAliasRow = (): AdminAliasRow => ({
  locale: ingredientAliasLocales[0],
  alias: "",
  source: "admin",
  isEnabled: true
});

/** Пустые строки алиасов молча отбрасываем — иначе схема ingredientUpsertSchema отвергнет всю форму. */
export const buildAliasPayload = (rows: AdminAliasRow[]) => rows
  .filter((row) => row.alias.trim().length > 0)
  .map((row) => ({
    id: row.id,
    locale: row.locale,
    alias: row.alias.trim(),
    source: row.source.trim() || "admin",
    isEnabled: row.isEnabled
  }));

/**
 * Строка редактора фасовки: редактируются не все поля DTO, но неотредактированные
 * (productNameEn, countryNameRu, sourceGroup, sourceUrl) переносим как есть —
 * иначе PATCH перезаписал бы варианты усечённой копией.
 */
export type AdminPackageVariantRow = IngredientPackageVariantDto & {
  packageAmountText: string;
  stockContentAmountText: string;
};

const formatAmount = (value: number | null) => (value == null ? "" : String(value));

export const toAdminPackageVariantRows = (
  variants: IngredientPackageVariantDto[] | undefined
): AdminPackageVariantRow[] => (
  (variants ?? []).map((variant) => ({
    ...variant,
    packageAmountText: formatAmount(variant.packageAmount),
    stockContentAmountText: formatAmount(variant.stockContentAmount)
  }))
);

export const createAdminPackageVariantRow = (index: number): AdminPackageVariantRow => ({
  id: `variant-${Date.now()}-${index}`,
  brand: null,
  productNameEn: null,
  productNameRu: null,
  countryNameRu: null,
  packageAmount: null,
  packageUnit: null,
  stockContentAmount: null,
  stockContentUnit: null,
  sourceGroup: null,
  sourceUrl: null,
  isDefaultForStock: false,
  position: index,
  packageAmountText: "",
  stockContentAmountText: ""
});

const parseAmount = (value: string): number | null => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const buildPackageVariantPayload = (rows: AdminPackageVariantRow[]) => rows.map((row, index) => ({
  id: row.id,
  brand: row.brand,
  productNameEn: row.productNameEn,
  productNameRu: row.productNameRu,
  countryNameRu: row.countryNameRu,
  packageAmount: parseAmount(row.packageAmountText),
  packageUnit: row.packageUnit,
  stockContentAmount: parseAmount(row.stockContentAmountText),
  stockContentUnit: row.stockContentUnit,
  sourceGroup: row.sourceGroup,
  sourceUrl: row.sourceUrl,
  isDefaultForStock: row.isDefaultForStock,
  position: index
}));

export type JsonFieldShape = "object" | "array" | "object_or_null";

export const stringifyJson = (value: unknown) => JSON.stringify(value, null, 2);

const shapeErrors: Record<JsonFieldShape, string> = {
  object: "Ожидается объект в фигурных скобках.",
  array: "Ожидается массив в квадратных скобках.",
  object_or_null: "Ожидается объект в фигурных скобках или null."
};

const matchesShape = (value: unknown, shape: JsonFieldShape): boolean => {
  if (shape === "array") {
    return Array.isArray(value);
  }

  const isObject = typeof value === "object" && value !== null && !Array.isArray(value);
  return shape === "object" ? isObject : isObject || value === null;
};

/** null — поле валидно; строка — текст ошибки для показа под полем. */
export const validateJsonText = (value: string, shape: JsonFieldShape): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return "Некорректный JSON.";
  }

  return matchesShape(parsed, shape) ? null : shapeErrors[shape];
};

/** Возвращает отформатированный текст либо null, если JSON не разбирается. */
export const formatJsonText = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  try {
    return stringifyJson(JSON.parse(trimmed));
  } catch {
    return null;
  }
};

export const parseJsonField = <T,>(value: string, fallback: T, label: string): T => {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`${label}: некорректный JSON`);
  }
};
