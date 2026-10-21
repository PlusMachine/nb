import { getSessionUser } from "@/lib/auth";

import { getCalculatorBySlug } from "./catalog";
import { canViewCalculator, getVisibleCalculatorSlugs } from "./visibility";

export const canAccessCalculator = async (slug: string): Promise<boolean> => {
  // Публичные страницы не читают cookies и сохраняют возможность SSG.
  if (canViewCalculator(slug)) return true;
  if (!getCalculatorBySlug(slug)) return false;
  return canViewCalculator(slug, (await getSessionUser())?.role);
};

export const getViewerCalculatorSlugs = async () => (
  process.env.NODE_ENV === "development"
    ? getVisibleCalculatorSlugs()
    : getVisibleCalculatorSlugs((await getSessionUser())?.role)
);
