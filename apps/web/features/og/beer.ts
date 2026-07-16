import type { BottleParams } from "@/features/beer-page/bottle-params";
import type { BeerPresentationDto } from "@/features/beer-page/contracts";
import { formatAbvShort, formatIbuShort } from "@/features/recipes/format";

import { formatBottlingDateRu, joinFacts } from "./format";
import { solidStripFromSrm, type OgCardView, type OgSecondaryLine } from "./models";
import { resolveTitleFontSize, stripUnsupportedGlyphs, truncateForCard } from "./theme";

// Карточка гостевой страницы пива (docs/specs/og-images.md §5.7) — превью для тех,
// кто отсканировал QR с бутылки. Факты бутылки (дата розлива, партия, фактический
// ABV) приходят из query наклейки, остальное — из DTO. Крепость бутылки (query)
// приоритетнее расчётной крепости рецепта.

const TITLE_MAX_LENGTH = 56;
const EYEBROW_MAX_LENGTH = 62;

const buildEyebrow = (beer: BeerPresentationDto): string => {
  if (!beer.style) {
    return "Пиво";
  }
  const parts = [
    "Пиво",
    beer.style.name,
    beer.style.code ? `BJCP ${beer.style.code}` : null
  ].filter((part): part is string => Boolean(part));
  return truncateForCard(parts.join(" · "), EYEBROW_MAX_LENGTH);
};

const buildFactsLine = (beer: BeerPresentationDto, bottle: BottleParams): string | null => {
  const abv = bottle.abv ?? beer.abv;
  return joinFacts([
    abv != null ? `ABV ${formatAbvShort(abv)}` : null,
    beer.ibu != null ? `IBU ${formatIbuShort(beer.ibu)}` : null
  ]);
};

const buildSecondaryLine = (bottle: BottleParams): OgSecondaryLine | null => {
  const date = formatBottlingDateRu(bottle.bottlingDate);
  const line = joinFacts([
    date ? `Разлито ${date}` : null,
    bottle.batchNo ? `партия #${bottle.batchNo}` : null
  ]);
  return line ? { kind: "text", text: line } : null;
};

export const buildBeerOgView = (
  beer: BeerPresentationDto,
  bottle: BottleParams,
  opts: { domain: string; wordmark: string }
): OgCardView => {
  const title = truncateForCard(stripUnsupportedGlyphs(beer.title) || "Пиво", TITLE_MAX_LENGTH);

  return {
    eyebrow: buildEyebrow(beer),
    title,
    titleFontSize: resolveTitleFontSize(title),
    subtitle: beer.author.displayName ? `Автор — ${beer.author.displayName}` : null,
    factsLine: buildFactsLine(beer, bottle),
    secondaryLine: buildSecondaryLine(bottle),
    strip: solidStripFromSrm(beer.colorSrm),
    domain: opts.domain,
    wordmark: opts.wordmark
  };
};
