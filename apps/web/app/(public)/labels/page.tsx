import type { Metadata } from "next";
import React, { Suspense } from "react";

import { LabelStudio } from "@/components/recipes/labels/label-studio";
import { buildCustomLabelSlots } from "@/features/labels/slots";
import { getSectionOgImage } from "@/features/og/section";
import { listRecipesForAuthor } from "@/features/recipes/service";
import { defaultPreferredGravityUnit, resolvePreferredGravityUnit } from "@/features/system/gravity-units";
import { getSessionUser } from "@/lib/auth";
import { getServerEnv } from "@/lib/env";

// Наклейки без рецепта: инструмент с ручным заполнением полей. Тот же
// генератор и те же шаблоны, что и на странице рецепта, — отличается только
// источник данных (форма вместо рецепта). QR здесь ведёт на рецепт, который
// пользователь укажет сам (слаг/ссылка либо выбор из своих опубликованных
// рецептов, если залогинен) — страница остаётся публичной, анониму список
// просто не показываем.

export const metadata: Metadata = {
  title: "Наклейки на бутылки",
  description: "Генератор наклеек на бутылки домашнего пива: заполните поля и скачайте готовый файл для печати (PNG или PDF).",
  alternates: {
    canonical: "/labels"
  },
  // openGraph страницы ЗАМЕЩАЕТ openGraph родительского layout целиком (не
  // мёржится) — locale/siteName повторяем сами (см. app/(public)/page.tsx).
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: getServerEnv().SITE_NAME,
    url: "/labels",
    title: "Наклейки на бутылки",
    description: "Генератор наклеек на бутылки домашнего пива: заполните поля и скачайте готовый файл для печати.",
    images: [getSectionOgImage("labels")]
  }
};

export default async function LabelsPage({ searchParams }: { searchParams?: Promise<{ batchId?: string }> }) {
  const user = await getSessionUser();
  const { batchId } = (await searchParams) ?? {};
  const myRecipes = user
    ? (await listRecipesForAuthor(user.id, { publicationState: "published" }))
        // Скрытый модератором рецепт из выбора убираем: QR вёл бы на закрытую страницу.
        .filter((recipe) => recipe.slug.length > 0 && recipe.hiddenAt == null)
        .map((recipe) => ({ slug: recipe.slug, title: recipe.title }))
    : [];
  // Страница публичная: у анонима шкалы в профиле нет — открываем в °P.
  const gravityUnit = user ? resolvePreferredGravityUnit(user.preferredGravityUnit) : defaultPreferredGravityUnit;

  return (
    <Suspense fallback={null}>
      <LabelStudio
        endpoint="/api/labels/custom"
        heading="Наклейки на бутылки"
        defaultSlots={buildCustomLabelSlots({ gravityUnit })}
        gravityUnit={gravityUnit}
        qrUnavailableReason="custom"
        myRecipes={myRecipes}
        loginHref={user ? undefined : "/login"}
        backLink={batchId ? { href: `/app/brew-batches/${batchId}`, label: "К партии" } : { href: "/calculators", label: "К инструментам" }}
        resetLabel="Очистить поля"
      />
    </Suspense>
  );
}
