import { getMasterSpecializationLabel, type MasterPublishedSnapshot } from "@/features/masters/contracts";

import { joinFacts } from "./format";
import { buildBrandSpectrumStops, type OgCardView } from "./models";
import { resolveTitleFontSize, stripUnsupportedGlyphs, truncateForCard } from "./theme";

// Карточка мастера без фото (docs/specs/og-images.md §5.6). С фото галереи мастер
// остаётся на нём; генерённая карточка — замена сайтовому дефолту. Раздел в
// проекте — «Маркет» (/market). Полоса — фирменный SRM-спектр.

const TITLE_MAX_LENGTH = 44;
const MAX_SPECIALIZATIONS = 3;

const buildFactsLine = (snapshot: MasterPublishedSnapshot): string | null => {
  const specializations = snapshot.specializations.slice(0, MAX_SPECIALIZATIONS).map(getMasterSpecializationLabel);
  return joinFacts([...specializations, snapshot.city]);
};

export const buildMasterOgView = (
  snapshot: MasterPublishedSnapshot,
  opts: { domain: string; wordmark: string }
): OgCardView => {
  const title = truncateForCard(stripUnsupportedGlyphs(snapshot.displayName) || "Мастер", TITLE_MAX_LENGTH);

  return {
    eyebrow: "Мастерская · Маркет",
    title,
    titleFontSize: resolveTitleFontSize(title),
    factsLine: buildFactsLine(snapshot),
    strip: { kind: "gradient", stops: buildBrandSpectrumStops() },
    domain: opts.domain,
    wordmark: opts.wordmark
  };
};
