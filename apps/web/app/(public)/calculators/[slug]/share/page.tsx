import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { calculatorHasStickyResultBar, calculatorQueryHasKnownFields, getCalculatorDefinition, initialCalculatorStateFromQuery, parseCalculatorQuery } from "@/features/calculators/definitions";
import { buildCalculatorMetadata, buildCalculatorShareMetadata } from "@/features/calculators/seo";

import { CalculatorPageView } from "../calculator-page-view";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Отдельный динамический саброут (Ф4, docs/specs/og-images.md §5.2): основная
// страница /calculators/[slug] сознательно статическая (SSG-инвариант — чтение
// searchParams в её generateMetadata уже роняли в P0-регрессию), поэтому query
// с результатом расчёта читаем здесь. Страница noindex, canonical — чистый
// /calculators/<slug>: это shared-ссылка на конкретный расчёт, а не отдельная
// индексируемая страница (см. seo.ts, buildCalculatorShareMetadata).
export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, rawQuery] = await Promise.all([params, searchParams]);
  const definition = getCalculatorDefinition(slug);

  if (!definition) {
    notFound();
  }

  const query = parseCalculatorQuery(rawQuery);

  if (
    Object.keys(query).length === 0 ||
    !calculatorQueryHasKnownFields(definition, query) ||
    !calculatorHasStickyResultBar(definition.catalog.slug)
  ) {
    // Пустой query, ИЛИ в query нет ни одного известного поля (посторонние ключи вроде
    // utm_source), ИЛИ калькулятор без generic-результата (keg-carbonation, unit-converter) —
    // страница ниже средиректит на основную, метадата не важна.
    return buildCalculatorMetadata(definition.catalog);
  }

  try {
    const result = definition.calculate(initialCalculatorStateFromQuery(definition, query));
    return buildCalculatorShareMetadata(definition.catalog, result, {
      queryString: new URLSearchParams(query).toString()
    });
  } catch (error) {
    // Битый/руками собранный query не должен ронять metadata — фолбэк на v1-мету.
    console.error("calculator share metadata failed", { slug, error });
    return buildCalculatorMetadata(definition.catalog);
  }
}

export default async function CalculatorSharePage({ params, searchParams }: Props) {
  const [{ slug }, rawQuery] = await Promise.all([params, searchParams]);
  const definition = getCalculatorDefinition(slug);

  if (!definition) {
    notFound();
  }

  const query = parseCalculatorQuery(rawQuery);
  const queryString = new URLSearchParams(query).toString();

  if (
    Object.keys(query).length === 0 ||
    !calculatorQueryHasKnownFields(definition, query) ||
    !calculatorHasStickyResultBar(definition.catalog.slug)
  ) {
    // Query пуст, ИЛИ в нём нет ни одного известного поля (только посторонние ключи вроде
    // utm_source), ИЛИ калькулятор без generic-результата — нечего шарить как результат,
    // отправляем на обычную страницу с тем же query.
    redirect(`/calculators/${slug}${queryString ? `?${queryString}` : ""}`);
  }

  return <CalculatorPageView definition={definition} />;
}
