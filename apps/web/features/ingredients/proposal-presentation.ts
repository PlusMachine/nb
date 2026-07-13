import {
  ingredientCategories,
  ingredientTypes,
  type IngredientCategory,
  type IngredientSubtype,
  type IngredientType
} from "./contracts";
import { formatIngredientSubtypeLabel, ingredientCategoryLabels } from "./presentation";

/** Откуда пришла заявка — значение proposed_ingredients.source_type. */
const proposalSourceLabels: Record<string, string> = {
  ingredient_picker_gap: "Подбор ингредиента",
  recipe_designer: "Мастер рецептов",
  inventory: "Мой склад"
};

export const formatIngredientProposalSourceLabel = (sourceType: string): string =>
  proposalSourceLabels[sourceType] ?? sourceType;

const proposalTypeLabels: Record<IngredientType, string> = {
  malt: "Солод",
  fermentable: "Сбраживаемое сырьё",
  hop: "Хмель",
  yeast: "Дрожжи",
  consumable: "Расходники и добавки",
  water_treatment: "Водоподготовка"
};

/**
 * source_payload — свободный jsonb: его пишут и мастер рецептов, и подбор
 * ингредиента, и внешний POST /api/ingredients/proposals. Поэтому известные
 * ключи показываем с русскими подписями и в фиксированном порядке, а всё
 * остальное — как есть, чтобы модератор ничего не потерял.
 */
const proposalFieldLabels: Record<string, string> = {
  displayName: "Название",
  name: "Название",
  category: "Категория",
  type: "Тип",
  subtype: "Подтип",
  brand: "Бренд",
  brandName: "Бренд",
  manufacturer: "Производитель",
  producer: "Производитель",
  country: "Страна",
  form: "Форма",
  colorEbc: "Цвет, EBC",
  extractYieldPct: "Экстрактивность, %",
  alphaAcidPct: "Альфа-кислоты, %",
  attenuationPct: "Аттенюация, %",
  url: "Ссылка",
  link: "Ссылка",
  note: "Комментарий",
  comment: "Комментарий"
};

const proposalFieldOrder = [
  "displayName",
  "name",
  "category",
  "type",
  "subtype",
  "brand",
  "brandName",
  "manufacturer",
  "producer",
  "country",
  "form",
  "colorEbc",
  "extractYieldPct",
  "alphaAcidPct",
  "attenuationPct",
  "url",
  "link",
  "note",
  "comment"
];

const isIngredientCategory = (value: string): value is IngredientCategory =>
  (ingredientCategories as readonly string[]).includes(value);

const isIngredientType = (value: string): value is IngredientType =>
  (ingredientTypes as readonly string[]).includes(value);

export type IngredientProposalField = {
  key: string;
  label: string;
  value: string;
};

const formatScalar = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? "да" : "нет";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (Array.isArray(value)) {
    const parts = value.map((item) => formatScalar(item)).filter((item): item is string => item != null);
    return parts.length > 0 ? parts.join(", ") : null;
  }
  return JSON.stringify(value);
};

const formatFieldValue = (key: string, value: unknown, payload: Record<string, unknown>): string | null => {
  const scalar = formatScalar(value);
  if (scalar == null) {
    return null;
  }

  if (key === "category" && isIngredientCategory(scalar)) {
    return ingredientCategoryLabels[scalar];
  }

  if (key === "type" && isIngredientType(scalar)) {
    return proposalTypeLabels[scalar];
  }

  if (key === "subtype") {
    const rawCategory = payload.category;
    if (typeof rawCategory === "string" && isIngredientCategory(rawCategory)) {
      return formatIngredientSubtypeLabel(rawCategory, scalar as IngredientSubtype);
    }
    return scalar.replaceAll("_", " ");
  }

  return scalar;
};

export const describeIngredientProposalPayload = (
  payload: Record<string, unknown>
): IngredientProposalField[] => {
  const keys = [
    ...proposalFieldOrder.filter((key) => key in payload),
    ...Object.keys(payload).filter((key) => !proposalFieldOrder.includes(key))
  ];

  const fields: IngredientProposalField[] = [];
  for (const key of keys) {
    const value = formatFieldValue(key, payload[key], payload);
    if (value == null) {
      continue;
    }
    fields.push({
      key,
      label: proposalFieldLabels[key] ?? key,
      value
    });
  }

  return fields;
};
