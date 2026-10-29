import "server-only";
import { loadIngredients } from "@/features/ingredients/service";
import { buildLabelSlots } from "@/features/labels/slots";
import { renderLabelPreviewPng } from "@/features/labels/render";
import type { PublicRecipeDetailDto } from "@/features/recipes/contracts";
import { getServerEnv } from "@/lib/env";
import { homeAuthorName, type HomeIngredient } from "./landing-model";
export async function getHomeIngredients(preferredIds: string[] = []): Promise<HomeIngredient[]> {
  const items = (await loadIngredients()).filter(item => item.isActive && item.visibility === "public" && item.inventoryEnabled);
  const selected: typeof items = [];
  for (const [category, pattern] of [["fermentable", /пэйл.*эль|pale ale/i], ["fermentable", /кара\s*кл[эе]р|cara clair/i], ["hop", /^amarillo$|^амарилло$/i], ["yeast", /us.?05/i]] as const) {
    const candidates = items.filter(item => item.category === category && !selected.some(chosen => chosen.id === item.id));
    const matches = candidates.filter(item => pattern.test(`${item.primaryLabelRu} ${item.brandName ?? item.brand ?? item.producer ?? ""}`) || pattern.test(item.primaryLabelRu));
    const match = matches.find(item => preferredIds.includes(item.id)) || matches[0] || candidates[0];
    if (match) selected.push(match);
  }
  return selected.map(item => {
    return {
      id: item.id,
      name: item.primaryLabelRu,
      secondaryName: item.displayNameEn,
      type: item.type,
      category: item.category,
      subtype: item.subtype,
      brand: item.brand,
      producer: item.producer,
      brandName: item.brandName,
      manufacturer: item.manufacturer,
      countryCode: item.countryCode,
      countryName: item.countryName,
      country: item.country,
      technicalData: item.technicalData
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
