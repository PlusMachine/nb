import type { Metadata } from "next";
import React from "react";
import { notFound } from "next/navigation";

import { CalculatorPageClient } from "@/components/calculators/calculator-page-client";
import {
  allCalculatorSlugs,
  getCalculatorDefinition,
  parseCalculatorQuery
} from "@/features/calculators/definitions";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export function generateStaticParams() {
  return allCalculatorSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const definition = getCalculatorDefinition(slug);

  if (!definition) {
    return {
      title: "Калькулятор не найден"
    };
  }

  return {
    title: definition.catalog.title,
    description: definition.catalog.description
  };
}

export default async function CalculatorPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const definition = getCalculatorDefinition(slug);

  if (!definition) {
    notFound();
  }

  const query = parseCalculatorQuery((await searchParams) ?? {});

  return <CalculatorPageClient slug={definition.catalog.slug} initialQuery={query} />;
}
