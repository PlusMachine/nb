import type { PublicRecipeListItem, RecipeDetailDto, RecipeIngredientDto } from "@/features/recipes/contracts";
import type { InventoryUnit } from "@/features/inventory/units";
import type { ContentArticleListItem } from "@/features/content-articles/contracts";
import type { RecipeIngredientCardSource } from "@/components/recipes/recipe-ingredient-card-display";
export type HomeIngredient = RecipeIngredientCardSource & {
  id: string;
  name: string;
  secondaryName: string | null;
};
export type HomeRequirement = {
  key: string;
  name: string;
  category: string;
  quantity: number;
  unit: InventoryUnit;
  ingredient?: RecipeIngredientDto;
};
export type HomeStock = HomeRequirement;
export const homeNumber = (value: number, digits = 2) => value.toLocaleString("ru-RU", {
  maximumFractionDigits: digits
});
export const homeQuantity = (quantity: number, unit: InventoryUnit) => {
  if (unit === "g" && Math.abs(quantity) >= 1000) return `${homeNumber(quantity / 1000, 3)} кг`;
  const labels: Partial<Record<InventoryUnit, string>> = {
    g: "г",
    kg: "кг",
    ml: "мл",
    l: "л",
    item: "шт.",
    pack: "уп.",
    gal: "галл.",
    lb: "фунт.",
    oz: "унц."
  };
  return `${homeNumber(quantity, 3)} ${labels[unit] ?? unit}`;
};
export const homeRequirements = (recipe: RecipeDetailDto, factor = 1): HomeRequirement[] => {
  const groups = new Map<string, HomeRequirement>();
  recipe.ingredients.forEach(line => {
    const name = line.ingredientDisplayNameRu || line.ingredientDisplayName || line.ingredientDisplayNameSnapshot || line.type;
    const identity = line.ingredientCatalogItemId ? `catalog:${line.ingredientCatalogItemId}` : `name:${line.ingredientCategory ?? line.type}:${name.toLocaleLowerCase("ru")}`;
    const key = `${identity}:${line.amountNormalizedUnit}`;
    const quantity = Math.max(0, Number(line.amountNormalizedQuantity) * factor);
    const previous = groups.get(key);
    if (previous) previous.quantity += quantity;else groups.set(key, {
      key,
      name,
      category: line.ingredientCategory || line.type,
      quantity,
      unit: line.amountNormalizedUnit,
      ingredient: line
    });
  });
  return [...groups.values()].filter(line => Number.isFinite(line.quantity) && line.quantity > 0);
};
/** Exact matches in the clearly marked, browser-local stock demo; never personal stock. */
export const homeCoverage = (requirements: HomeRequirement[], stock: HomeStock[]) => {
  const weights: Record<string, number> = {
    fermentable: 5,
    malt: 5,
    hop: 3,
    yeast: 4,
    water_treatment: 1,
    consumable: 1
  };
  let total = 0,
    covered = 0;
  const missing = requirements.flatMap(line => {
    const available = stock.find(item => item.key === line.key)?.quantity ?? 0;
    const weight = weights[line.category] ?? 2;
    total += weight;
    covered += weight * Math.min(1, available / line.quantity);
    const shortfall = Math.max(0, line.quantity - available);
    return shortfall > 0.000001 ? [{
      ...line,
      quantity: shortfall
    }] : [];
  });
  const percent = total ? Math.round(100 * covered / total) : 0;
  return {
    percent: missing.length ? Math.min(99, percent) : percent,
    missing
  };
};
export const homeLoginHref = (next: string) => `/login?next=${encodeURIComponent(next)}`;
export const homeAuthorName = (name: string | null) => name && !/^qa(?:[\s._-]|$)/i.test(name) ? name : null;

/** A shared example stock, complete for the first recipe, with honest shortages for the others. */
export function createHomeDemoStock(recipes: RecipeDetailDto[]): HomeStock[] {
  const requirements = recipes.map(recipe => homeRequirements(recipe));
  const firstKeys = new Set(requirements[0]?.map(line => line.key));
  const excluded = new Set<string>();

  requirements.slice(1).forEach((lines, index) => {
    const alreadyMissing = lines.filter(line => excluded.has(line.key)).length;
    const previousKeys = new Set(requirements.slice(0, index + 1).flatMap(recipe => recipe.map(line => line.key)));
    const candidates = lines.filter(line => !firstKeys.has(line.key) && !excluded.has(line.key))
      .sort((a, b) => Number(previousKeys.has(a.key)) - Number(previousKeys.has(b.key)));
    for (const line of candidates.slice(0, Math.max(0, index + 1 - alreadyMissing))) {
      // Keep earlier examples stable when recipes happen to share the same ingredients.
      if (index === 0 || !previousKeys.has(line.key)) excluded.add(line.key);
    }
  });

  const stock = new Map<string, HomeStock>();
  for (const line of requirements.flat()) {
    if (excluded.has(line.key)) continue;
    const quantity = line.unit === "pack" || line.unit === "item"
      ? Math.ceil(line.quantity * 1.15)
      : Math.ceil(line.quantity * 1.15 * 1000) / 1000;
    if (quantity > (stock.get(line.key)?.quantity ?? 0)) stock.set(line.key, { ...line, quantity });
  }
  return [...stock.values()];
}

export function homeStockPreview(stock: HomeStock[]): HomeStock[] {
  const selected: HomeStock[] = [];
  for (const category of ["fermentable", "fermentable", "hop", "yeast"]) {
    const item = stock.find(line => (line.category === category || category === "fermentable" && line.category === "malt") && !selected.includes(line));
    if (item) selected.push(item);
  }
  return [...selected, ...stock.filter(line => !selected.includes(line))].slice(0, 4);
}

/** Curation only affects the landing page; titles and public recipes are never rewritten. */
export function pickHomeArticles(items: ContentArticleListItem[]): ContentArticleListItem[] {
  const topics = new Set<string>();
  return items.filter(article => {
    const title = article.title.toLocaleLowerCase("ru").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
    const topic = /перв\p{L}*\s+(?:пиво|варк)/u.test(title) ? "first-brew" : title;
    if (topics.has(topic)) return false;
    topics.add(topic);
    return true;
  }).slice(0, 3);
}

export const homeStyleDescriptions: Record<string, string> = {
  "4A": "Золотистый немецкий лагер с мягким солодовым вкусом, сдержанной горечью и сухим послевкусием.",
  "21A": "Светлый американский эль с выраженным хмелевым ароматом, заметной горечью и сухим послевкусием.",
  "15B": "Чёрное пиво с кофейными оттенками обжаренного зерна. При подаче на азоте приобретает кремовую текстуру."
};

/** Prefer different styles and titles while retaining newest-first order. */
export function pickHomeRecipes(items: PublicRecipeListItem[]): PublicRecipeListItem[] {
  const candidates = items.filter(item => !/^(?:sample\s*[·:—-]|тестовый\s+рецепт(?:\s|$))/iu.test(item.name ?? ""));
  const selected: PublicRecipeListItem[] = [];
  for (const item of candidates) {
    if (!selected.some(previous => previous.name === item.name || item.style && previous.style?.code === item.style.code)) selected.push(item);
    if (selected.length === 3) return selected;
  }
  for (const item of candidates) {
    if (!selected.some(previous => previous.id === item.id)) selected.push(item);
    if (selected.length === 3) break;
  }
  return selected;
}
