import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Suspense } from "react";

import { CalculatorPageClient } from "@/components/calculators/calculator-page-client";
import { CalculatorHeading, CommonMistakesDetails, FormulaDetails } from "@/components/calculators/calculator-static-sections";
import { calculatorHasStickyResultBar, type CalculatorDefinition } from "@/features/calculators/definitions";
import { buildCalculatorBreadcrumbJsonLd, buildCalculatorWebAppJsonLd } from "@/features/calculators/seo";
import { jsonLdScriptProps } from "@/features/ingredients/seo";
import { getServerEnv } from "@/lib/env";

// Тело страницы калькулятора (breadcrumb + контент + json-ld), вынесенное из
// page.tsx (Ф4, docs/specs/og-images.md §5.2): переиспользуется и основной
// статической страницей /calculators/[slug], и динамическим саброутом
// /calculators/[slug]/share — без дублирования разметки между ними.
export function CalculatorPageView({ definition }: { definition: CalculatorDefinition }) {
  const baseUrl = getServerEnv().APP_URL;
  const breadcrumbJsonLd = buildCalculatorBreadcrumbJsonLd(definition.catalog, { baseUrl });
  const webAppJsonLd = buildCalculatorWebAppJsonLd(definition.catalog, { baseUrl });
  const isRefractometer = definition.catalog.slug === "refractometer-correction";
  // На мобильном липкий бар результата (см. CalculatorPageClient) перекрывает нижнюю часть
  // страницы поверх нижней навигации — без запаса «Частые ошибки» уезжали бы под них обоих.
  // Страницы без generic-результата (keg-carbonation, unit-converter) бар не показывают —
  // им хватает обычного отступа.
  const hasStickyBar = calculatorHasStickyResultBar(definition.catalog.slug);

  return (
    <>
      <nav aria-label="Breadcrumb" className="pt-6 text-sm text-muted-foreground">
        <ol className="flex flex-wrap items-center gap-2">
          <li><Link href="/" className="transition hover:text-foreground">Главная</Link></li>
          <li aria-hidden="true">/</li>
          <li><Link href="/calculators" className="transition hover:text-foreground">Калькуляторы</Link></li>
          <li aria-hidden="true">/</li>
          <li className="text-foreground">{definition.catalog.shortTitle}</li>
        </ol>
      </nav>

      <main className={`space-y-5 pt-8 ${hasStickyBar ? "pb-44 lg:pb-24" : "pb-24"} ${isRefractometer ? "mx-auto max-w-5xl" : ""}`}>
        <Link href="/calculators" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Все калькуляторы
        </Link>

        <CalculatorHeading item={definition.catalog} />

        <Suspense fallback={null}>
          <CalculatorPageClient slug={definition.catalog.slug} />
        </Suspense>

        <FormulaDetails
          formula={definition.catalog.formula}
          meaning={definition.catalog.meaning}
          assumptions={definition.catalog.assumptions}
        />
        <CommonMistakesDetails items={definition.catalog.commonMistakes} />
      </main>

      <script {...jsonLdScriptProps(breadcrumbJsonLd)} />
      <script {...jsonLdScriptProps(webAppJsonLd)} />
    </>
  );
}
