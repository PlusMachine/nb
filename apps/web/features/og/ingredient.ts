import type { IngredientTechnicalData, UserCatalogIngredientDto } from "@/features/ingredients/contracts";
import { resolveIngredientBrandLabel, resolveIngredientCountry, resolveYeastFormLabelRu } from "@/features/ingredients/presentation";
import { formatHopFormLabel, resolveIngredientTechnicalDataColorRangeEbc } from "@/features/ingredients/technical-fields";

import { formatNumberRange, joinFacts } from "./format";
import { solidStripFromSrm, type OgCardView, type OgStrip } from "./models";
import { OG_COLORS, resolveTitleFontSize, stripUnsupportedGlyphs, truncateForCard } from "./theme";

// Карточка ингредиента (docs/specs/og-images.md §5.3). Фото у ингредиентов нет —
// карточка генерится всегда. Строка фактов зависит от типа: хмель → альфа/форма/
// страна, солод → цвет EBC/бренд/страна (+полоса цвета пива), дрожжи →
// аттенюация/температура/форма.

const TITLE_MAX_LENGTH = 60;

type HopData = Extract<IngredientTechnicalData, { type: "hop" }>;
type YeastData = Extract<IngredientTechnicalData, { type: "yeast" }>;

/** Тип ингредиента для eyebrow: по technicalData, с фолбэком на category/subtype. */
const resolveEyebrow = (item: UserCatalogIngredientDto): string => {
  switch (item.technicalData?.type) {
    case "hop":
      return "Хмель";
    case "malt":
      return "Солод";
    case "fermentable":
      return "Сбраживаемое сырьё";
    case "yeast":
      return "Дрожжи";
    case "water_treatment":
      return "Водоподготовка";
    case "consumable":
      return "Расходник";
    default:
      break;
  }
  switch (item.category) {
    case "hop":
      return "Хмель";
    case "yeast":
      return "Дрожжи";
    case "fermentable":
      return item.subtype === "malt" ? "Солод" : "Сбраживаемое сырьё";
    case "water_treatment":
      return "Водоподготовка";
    case "consumable":
      return "Расходник";
    default:
      return "Ингредиент";
  }
};

const buildFactsLine = (item: UserCatalogIngredientDto): string | null => {
  const country = resolveIngredientCountry(item)?.label ?? null;
  const brand = resolveIngredientBrandLabel(item);
  const td = item.technicalData ?? null;

  if (td?.type === "hop") {
    const hop = td as HopData;
    const alpha = formatNumberRange(
      hop.alphaAcidPctMin ?? hop.alphaAcidPctTypical,
      hop.alphaAcidPctMax ?? hop.alphaAcidPctTypical,
      { digits: 1 }
    );
    const form = formatHopFormLabel(hop.hopForm)?.toLowerCase() ?? null;
    return joinFacts([alpha ? `Альфа ${alpha} %` : null, form, country]);
  }

  if (td?.type === "yeast") {
    const yeast = td as YeastData;
    const attenuation = formatNumberRange(
      yeast.attenuationPctMin ?? yeast.attenuationPctTypical,
      yeast.attenuationPctMax ?? yeast.attenuationPctTypical,
      { digits: 0 }
    );
    const temp = formatNumberRange(yeast.fermentationTempCMin, yeast.fermentationTempCMax, { digits: 0 });
    const form = resolveYeastFormLabelRu(yeast.form);
    return joinFacts([
      attenuation ? `Аттенюация ${attenuation} %` : null,
      temp ? `${temp} °C` : null,
      form
    ]);
  }

  // Солод / сбраживаемое: цвет в EBC + бренд + страна.
  const ebc = resolveIngredientTechnicalDataColorRangeEbc(td);
  const ebcText = ebc ? formatNumberRange(ebc.min, ebc.max, { digits: 0 }) : null;
  return joinFacts([ebcText ? `${ebcText} EBC` : null, brand, country]);
};

const buildStrip = (item: UserCatalogIngredientDto): OgStrip => {
  // Полоса цвета пива — только у солода/сбраживаемого (есть EBC). Остальные —
  // нейтральная (у хмеля/дрожжей/воды своего цвета в стакане нет).
  const ebc = resolveIngredientTechnicalDataColorRangeEbc(item.technicalData ?? null);
  return ebc ? solidStripFromSrm(ebc.average / 1.97) : { kind: "solid", color: OG_COLORS.neutralStrip };
};

export const buildIngredientOgView = (
  item: UserCatalogIngredientDto,
  opts: { domain: string; wordmark: string }
): OgCardView => {
  const title = truncateForCard(stripUnsupportedGlyphs(item.primaryLabelRu) || "Ингредиент", TITLE_MAX_LENGTH);
  const secondary = item.secondaryLabelRu && item.secondaryLabelRu !== item.primaryLabelRu
    ? truncateForCard(stripUnsupportedGlyphs(item.secondaryLabelRu), 56)
    : null;

  return {
    eyebrow: resolveEyebrow(item),
    title,
    titleFontSize: resolveTitleFontSize(title),
    subtitle: secondary,
    factsLine: buildFactsLine(item),
    strip: buildStrip(item),
    domain: opts.domain,
    wordmark: opts.wordmark
  };
};
