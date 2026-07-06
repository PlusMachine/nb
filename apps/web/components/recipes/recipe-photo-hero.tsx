"use client";

import React, { useState } from "react";
import Image from "next/image";

/**
 * Обложка рецепта на публичной детальной странице. Реальное фото отдаётся по
 * `heroImageId` (вариант `large`). Если изображение не загрузилось (обложка ещё
 * не готова / удалена) — блок схлопывается в `null`, чтобы не оставлять пустой
 * плейсхолдер. Идентичность по цвету пива при этом всегда есть в шапке.
 */
export function RecipePhotoHero({ imageId, title }: { imageId: string; title: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return null;
  }

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-muted shadow-sm">
      <div className="relative aspect-[16/9] w-full">
        <Image
          src={`/api/recipe-images/${imageId}/large`}
          alt={`Фото рецепта «${title}»`}
          fill
          unoptimized
          sizes="(min-width: 1024px) 60vw, 100vw"
          className="object-cover"
          onError={() => setFailed(true)}
        />
      </div>
    </section>
  );
}
