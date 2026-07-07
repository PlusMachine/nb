import React, { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MasterPageView } from "@/components/masters/public/master-page-view";
import { jsonLdScriptProps } from "@/features/ingredients/seo";
import { buildMasterBreadcrumbJsonLd, buildMasterJsonLd, buildMasterPageMetadata } from "@/features/masters/seo";
import { getPublishedMasterBySlug } from "@/features/masters/service";
import { getServerEnv } from "@/lib/env";

// TTL-страховка (по образцу /recipes/[slug]) — approve/setListed уже могут
// дёргать revalidatePath точечно, но 5 минут отдаём фолбэком на случай, если
// он не сработал где-то на побочном пути.
export const revalidate = 300;

// Без loading.tsx: соседний фикс каталога (см. заметку в памяти проекта
// «loading.tsx vs 404») — Suspense-фолбэк успевает отдать 200 до того, как
// notFound() решит статус для снятого с публикации/несуществующего мастера.
// notFound() поэтому бросаем уже в generateMetadata, а не только в теле страницы.
const loadMaster = cache(async (slug: string) => {
  const result = await getPublishedMasterBySlug(slug);
  if (!result) {
    throw new Error("NOT_FOUND");
  }
  return result;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;

  try {
    const { snapshot } = await loadMaster(slug);
    return buildMasterPageMetadata(slug, snapshot);
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}

export default async function MasterRoute({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  try {
    const { snapshot } = await loadMaster(slug);
    const { APP_URL } = getServerEnv();
    const masterJsonLd = buildMasterJsonLd(slug, snapshot, { baseUrl: APP_URL });
    const breadcrumbJsonLd = buildMasterBreadcrumbJsonLd(slug, snapshot, { baseUrl: APP_URL });

    return (
      <>
        <MasterPageView snapshot={snapshot} />
        <script {...jsonLdScriptProps(masterJsonLd)} />
        <script {...jsonLdScriptProps(breadcrumbJsonLd)} />
      </>
    );
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      notFound();
    }
    throw error;
  }
}
