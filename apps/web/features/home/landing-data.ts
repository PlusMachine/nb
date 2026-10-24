import "server-only";
import { loadIngredients } from "@/features/ingredients/service";
import { resolveIngredientTechnicalDataColorRangeEbc, resolveIngredientTechnicalDataHopAlphaAcidPct } from "@/features/ingredients/technical-fields";
import { buildLabelSlots } from "@/features/labels/slots";
import { renderLabelPreviewPng } from "@/features/labels/render";
import type { PublicRecipeDetailDto } from "@/features/recipes/contracts";
import { getServerEnv } from "@/lib/env";
import { homeAuthorName, homeNumber, type HomeIngredient } from "./landing-model";
export async function getHomeIngredients(): Promise<HomeIngredient[]> {
  const items = (await loadIngredients()).filter(item => item.isActive && item.visibility === "public" && item.inventoryEnabled);
  const selected: typeof items = [];
  for (const [category, pattern] of [["fermentable", /курск.*пил|пил.*курск/i], ["fermentable", /soufflet|суфле/i], ["hop", /^cascade$|^каскад$/i], ["yeast", /us.?05/i]] as const) {
    const candidates = items.filter(item => item.category === category && !selected.some(chosen => chosen.id === item.id));
    const matches = candidates.filter(item => pattern.test(`${item.primaryLabelRu} ${item.brandName ?? item.brand ?? item.producer ?? ""}`) || pattern.test(item.primaryLabelRu));
    const match = (category === "fermentable" ? matches.find(item => /пилснер|пильз|pilsner/i.test(item.primaryLabelRu) && !/карам|caram/i.test(item.primaryLabelRu)) : matches[0]) || matches[0] || candidates[0];
    if (match) selected.push(match);
  }
  return selected.map(item => {
    const color = resolveIngredientTechnicalDataColorRangeEbc(item.technicalData);
    const alpha = resolveIngredientTechnicalDataHopAlphaAcidPct(item.technicalData);
    return {
      id: item.id,
      name: item.primaryLabelRu,
      producer: item.brandName || item.brand || item.producer,
      category: item.category,
      metric: item.category === "fermentable" && color ? "Цветность" : item.category === "hop" && alpha != null ? "Альфа-кислоты" : null,
      value: item.category === "fermentable" && color ? `${homeNumber(color.min)}${color.max !== color.min ? `–${homeNumber(color.max)}` : ""} EBC` : item.category === "hop" && alpha != null ? `${homeNumber(alpha)}%` : null
    };
  });
}
let labelCache: {
  key: string;
  images: [string, string];
} | null = null;
export async function getHomeLabelImages(recipe: PublicRecipeDetailDto): Promise<[string, string]> {
  const key = `${recipe.id}:${recipe.updatedAt.toISOString()}`;
  if (labelCache?.key === key) return labelCache.images;
  const slots = buildLabelSlots({
    recipe,
    baseUrl: getServerEnv().APP_URL
  });
  slots.authorName = homeAuthorName(slots.authorName);
  const images = (await Promise.all((["typographic", "craft"] as const).map(async template => {
    const png = await renderLabelPreviewPng({
      template,
      preset: "LW",
      dpi: 203,
      slots
    });
    return `data:image/png;base64,${png.toString("base64")}`;
  }))) as [string, string];
  labelCache = {
    key,
    images
  };
  return images;
}
