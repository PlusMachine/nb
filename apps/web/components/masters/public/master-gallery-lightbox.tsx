"use client";

import Image from "next/image";
import { Dialog } from "@nb/ui";

import { buildMasterImageVariantUrl, type MasterPublishedSnapshotImageRef } from "@/features/masters/contracts";

/**
 * Тонкий лайтбокс галереи мастера на `Dialog` из `@nb/ui` — сознательно НЕ
 * переиспользует `recipe-image-lightbox.tsx` (тот завязан на `RecipeImageCardItem`
 * рецептного редактора и тянет `yet-another-react-lightbox` с drag&drop-контекстом,
 * которых здесь нет). Одно фото, без стрелок «вперёд/назад» — MVP витрины
 * обозрима целиком, лишний UI не нужен.
 */
export function MasterGalleryLightbox({
  images,
  openIndex,
  onClose
}: {
  images: MasterPublishedSnapshotImageRef[];
  openIndex: number | null;
  onClose: () => void;
}) {
  const current = openIndex != null ? images[openIndex] ?? null : null;

  return (
    <Dialog open={current != null} onOpenChange={(next) => { if (!next) onClose(); }} title="Фото работы мастера" hideTitle size="lg">
      {current ? (
        <div className="relative aspect-[4/3] w-full sm:aspect-video">
          <Image
            src={buildMasterImageVariantUrl(current.imageId, "large")}
            alt="Фото работы мастера"
            fill
            unoptimized
            sizes="(min-width: 640px) 42rem, 100vw"
            className="object-contain"
            placeholder={current.blurDataUrl ? "blur" : "empty"}
            blurDataURL={current.blurDataUrl ?? undefined}
          />
        </div>
      ) : null}
    </Dialog>
  );
}
