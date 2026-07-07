import { ChevronRight } from "lucide-react";

import { CalculatorFavoriteToggle } from "@/components/calculators/calculator-favorite-toggle";
import { isCalculatorVerified, type CalculatorCatalogItem } from "@/features/calculators/catalog";

// Серверные (не "use client") статичные секции калькулятора — шапка (h1+intro),
// формула/допущения и частые ошибки. Вынесены из calculator-page-client.tsx, чтобы
// этот индексируемый контент попадал в статический HTML независимо от того,
// гидрировался ли клиентский useSearchParams (docs/seo-playbook.md, §7).

// Пометка статуса валидации у заголовка — только в dev.
const devMode = process.env.NODE_ENV !== "production";

export function CalculatorHeading({ item }: { item: CalculatorCatalogItem }) {
  return (
    <section className="relative rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
      <CalculatorFavoriteToggle
        slug={item.slug}
        size="md"
        className="absolute right-4 top-4"
      />
      <div className="max-w-3xl space-y-2 pr-10">
        {devMode ? (
          <span
            className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
              isCalculatorVerified(item.slug)
                ? "bg-success-subtle text-success-subtle-foreground"
                : "bg-warning-subtle text-warning-subtle-foreground"
            }`}
          >
            {isCalculatorVerified(item.slug) ? "✓ проверен (dev)" : "не проверен (dev)"}
          </span>
        ) : null}
        <h1 className="text-2xl font-semibold leading-tight text-foreground sm:text-3xl">{item.title}</h1>
        <p className="text-sm leading-6 text-muted-foreground">{item.intro}</p>
      </div>
    </section>
  );
}

export function FormulaDetails({
  formula,
  meaning,
  assumptions
}: {
  formula: string;
  meaning: string[];
  assumptions: string[];
}) {
  return (
    <details className="group rounded-2xl border border-border bg-card p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
        </div>
        Как считаем?
        <span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">?</span>
      </summary>
      <div className="mt-3 space-y-2">
        {formula.split("\n").map((paragraph) => (
          <p key={paragraph} className="text-sm leading-6 text-muted-foreground">{paragraph}</p>
        ))}
        {meaning.map((paragraph) => (
          <p key={paragraph} className="text-sm leading-6 text-muted-foreground">{paragraph}</p>
        ))}
        {assumptions.length > 0 ? (
          <div className="pt-1">
            <p className="text-xs font-medium text-muted-foreground">Допущения</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              {assumptions.map((item) => (
                <li key={item} className="text-xs leading-5 text-muted-foreground">{item}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </details>
  );
}

export function CommonMistakesDetails({ items }: { items: string[] }) {
  if (items.length === 0) {
    return null;
  }

  return (
    <details className="group rounded-2xl border border-border bg-card p-4 shadow-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
          <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
        </div>
        Частые ошибки
      </summary>
      <ul className="mt-3 list-disc space-y-1.5 pl-4">
        {items.map((item) => (
          <li key={item} className="text-sm leading-6 text-muted-foreground">{item}</li>
        ))}
      </ul>
    </details>
  );
}
