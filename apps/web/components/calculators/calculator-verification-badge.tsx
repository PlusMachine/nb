import { isCalculatorVerified, type CalculatorSlug } from "@/features/calculators/catalog";

export function CalculatorVerificationBadge({ slug }: { slug: CalculatorSlug }) {
  if (process.env.NODE_ENV !== "development" || !isCalculatorVerified(slug)) return null;

  return (
    <span className="inline-flex w-fit items-center gap-1 rounded-full bg-success-subtle px-2 py-0.5 text-[10px] font-semibold text-success-subtle-foreground">
      ✓ проверен
    </span>
  );
}
