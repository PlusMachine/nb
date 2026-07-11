import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import React, { Suspense } from "react";
import { notFound } from "next/navigation";

import { CalculatorPageClient } from "@/components/calculators/calculator-page-client";
import { CalculatorHeading, CommonMistakesDetails, FormulaDetails } from "@/components/calculators/calculator-static-sections";
import { allCalculatorSlugs, calculatorHasStickyResultBar, getCalculatorDefinition } from "@/features/calculators/definitions";
import { buildCalculatorBreadcrumbJsonLd, buildCalculatorMetadata, buildCalculatorWebAppJsonLd } from "@/features/calculators/seo";
import { jsonLdScriptProps } from "@/features/ingredients/seo";
import { getServerEnv } from "@/lib/env";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return allCalculatorSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const definition = getCalculatorDefinition(slug);

  if (!definition) {
    notFound();
  }

  return buildCalculatorMetadata(definition.catalog);
}

// Страница не читает searchParams — она статическая (generateStaticParams).
// Состояние из query (?og=…&fg=…) читает CalculatorPageClient через
// useSearchParams() на клиенте, обёрнутый в Suspense ниже, чтобы этот хук не
// опрокидывал весь роут в динамический рендеринг (docs/seo-playbook.md, §7).
//
// Индексируемый контент (шапка, формула/допущения, частые ошибки) рендерится
// СЕРВЕРНО вне Suspense — иначе при статической генерации в HTML остаётся
// только фолбэк, а не реальный контент калькулятора (docs/seo-playbook.md, §7).
// Интерактив (поля, результаты, related-ссылки) остаётся внутри
// CalculatorPageClient — он не индексируем и не критичен для SEO.
export default async function CalculatorPage({ params }: Props) {
  const { slug } = await params;
  const definition = getCalculatorDefinition(slug);

  if (!definition) {
    notFound();
  }

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
