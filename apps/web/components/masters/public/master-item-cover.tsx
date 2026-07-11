"use client";

import { useState } from "react";

import type { MasterPublishedSnapshotItem } from "@/features/masters/contracts";

import { MasterGalleryLightbox } from "./master-gallery-lightbox";
import { MasterImage } from "./master-image";

/** Индекс обложки изделия в `item.images` (совпадает с `resolveItemCoverRef`, который раньше жил в `master-page-view.tsx`). */
const resolveItemCoverIndex = (item: MasterPublishedSnapshotItem): number => {
  if (item.coverImageId) {
    const index = item.images.findIndex((ref) => ref.imageId === item.coverImageId);
    if (index >= 0) {
      return index;
    }
  }
  return 0;
};

/**
 * Обложка карточки изделия (§6.3 ТЗ): клик открывает лайтбокс по всем фото
 * изделия (`item.images`, до 6 шт.), а не только по обложке — иначе остальные
 * фото недостижимы с публичной страницы. Клиентский компонент нужен только
 * тут (состояние лайтбокса); сам `MasterPageView` остаётся серверным.
 */
export function MasterItemCover({ item }: { item: MasterPublishedSnapshotItem }) {
  const [open, setOpen] = useState(false);
  const hasImages = item.images.length > 0;
  const coverIndex = resolveItemCoverIndex(item);
  const coverRef = hasImages ? item.images[coverIndex] ?? null : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={!hasImages}
        aria-label={hasImages ? `Смотреть фото изделия «${item.title}»` : undefined}
        className="block aspect-[4/3] w-full disabled:cursor-default"
      >
        <MasterImage
          imageRef={coverRef}
          variant="medium"
          alt={item.title}
          className="aspect-[4/3] w-full"
          sizes="(min-width: 1024px) 380px, 100vw"
        />
      </button>
      {hasImages ? (
        <MasterGalleryLightbox images={item.images} openIndex={open ? coverIndex : null} onClose={() => setOpen(false)} />
      ) : null}
    </>
  );
}
