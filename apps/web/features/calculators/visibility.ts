import {
  allCalculatorSlugs,
  getCalculatorBySlug,
  isCalculatorPublished,
  isCalculatorVerified,
  type CalculatorSlug
} from "./catalog";

export const isCalculatorPublic = (slug: CalculatorSlug): boolean => (
  isCalculatorVerified(slug) && isCalculatorPublished(slug)
);

export const canViewCalculator = (slug: string, role?: string | null): boolean => {
  const calculator = getCalculatorBySlug(slug);
  return calculator !== null && (
    process.env.NODE_ENV === "development" || role === "admin" || isCalculatorPublic(calculator.slug)
  );
};

export const getVisibleCalculatorSlugs = (role?: string | null): CalculatorSlug[] => (
  allCalculatorSlugs.filter((slug) => canViewCalculator(slug, role))
);

// Применяется и к ссылкам с параметрами расчёта, и к обычным related-ссылкам.
export const isVisibleCalculatorLink = (href: string, visibleSlugs: readonly CalculatorSlug[]): boolean => {
  const match = /^\/calculators\/([^/?#]+)/.exec(href);
  return !match || visibleSlugs.includes(match[1] as CalculatorSlug);
};
