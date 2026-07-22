import type { Metadata } from "next";
import React from "react";

import { CalculatorsIndex } from "@/components/calculators/calculators-index";
import { getSectionOgImage } from "@/features/og/section";
import { getServerEnv } from "@/lib/env";

export const metadata: Metadata = {
  title: "Калькуляторы для пивоварения",
  description: "Автономные пивоваренные расчёты для варки, брожения и розлива.",
  alternates: {
    canonical: "/calculators"
  },
  // openGraph страницы ЗАМЕЩАЕТ openGraph родительского layout целиком (не
  // мёржится) — locale/siteName повторяем сами (см. app/(public)/page.tsx).
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: getServerEnv().SITE_NAME,
    url: "/calculators",
    title: "Калькуляторы для пивоварения",
    description: "Автономные пивоваренные расчёты для варки, брожения и розлива.",
    images: [getSectionOgImage("calculators")]
  }
};

export default function CalculatorsPage() {
  return <CalculatorsIndex />;
}
