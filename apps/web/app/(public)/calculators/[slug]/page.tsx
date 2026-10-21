import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { canAccessCalculator } from "@/features/calculators/access";
import { getCalculatorDefinition } from "@/features/calculators/definitions";
import { buildCalculatorMetadata } from "@/features/calculators/seo";
import { getVisibleCalculatorSlugs, isCalculatorPublic } from "@/features/calculators/visibility";

import { CalculatorPageView } from "./calculator-page-view";

type Props = {
  params: Promise<{ slug: string }>;
};

export function generateStaticParams() {
  return getVisibleCalculatorSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const definition = getCalculatorDefinition(slug);

  if (!definition || !(await canAccessCalculator(slug))) {
    notFound();
  }

  return buildCalculatorMetadata(definition.catalog);
}

// Публичные калькуляторы статические; закрытые проверяют сессию на сервере.
// Страница не читает searchParams.
// Состояние из query (?og=…&fg=…) читает CalculatorPageClient через
// useSearchParams() на клиенте, обёрнутый в Suspense внутри CalculatorPageView,
// чтобы этот хук не опрокидывал весь роут в динамический рендеринг
// (docs/seo-playbook.md, §7).
//
// Индексируемый контент (шапка, формула/допущения, частые ошибки) рендерится
// СЕРВЕРНО вне Suspense — иначе при статической генерации в HTML остаётся
// только фолбэк, а не реальный контент калькулятора (docs/seo-playbook.md, §7).
// Интерактив (поля, результаты, related-ссылки) остаётся внутри
// CalculatorPageClient — он не индексируем и не критичен для SEO.
//
// Тело страницы (breadcrumb + main + json-ld) вынесено в CalculatorPageView —
// его же переиспользует динамический саброут /share (Ф4, docs/specs/og-images.md §5.2).
export default async function CalculatorPage({ params }: Props) {
  const { slug } = await params;
  const definition = getCalculatorDefinition(slug);

  if (!definition || !(await canAccessCalculator(slug))) {
    notFound();
  }

  return <CalculatorPageView
    definition={definition}
    visibleCalculatorSlugs={getVisibleCalculatorSlugs(isCalculatorPublic(definition.catalog.slug) ? undefined : "admin")}
  />;
}
