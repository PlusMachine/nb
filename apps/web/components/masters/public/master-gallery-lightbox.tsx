"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Dialog } from "@nb/ui";

import { buildMasterImageVariantUrl, type MasterPublishedSnapshotImageRef } from "@/features/masters/contracts";

/**
 * Тонкий лайтбокс галереи мастера на `Dialog` из `@nb/ui` — сознательно НЕ
 * переиспользует `recipe-image-lightbox.tsx` (тот завязан на `RecipeImageCardItem`
 * рецептного редактора и тянет `yet-another-react-lightbox` с drag&drop-контекстом,
 * которых здесь нет).
 * Переиспользуется в двух местах: миниатюры «Галереи работ» (каждая уже кликабельна
 * своим индексом) и обложка карточки изделия (§6.3 — у изделия до 6 фото, но карточка
 * показывает только обложку) — там стрелки «вперёд/назад» обязательны, иначе
 * остальные фото изделия недостижимы. `openIndex` — точка входа, дальше индекс
 * листается стрелками локально, без обратной связи родителю.
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
  const [index, setIndex] = useState<number | null>(openIndex);

  useEffect(() => {
    setIndex(openIndex);
  }, [openIndex]);

  const current = index != null ? images[index] ?? null : null;
  const hasMultiple = images.length > 1;

  const goTo = (delta: number) => {
    setIndex((prev) => (prev == null ? prev : (prev + delta + images.length) % images.length));
  };

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
          {hasMultiple ? (
            <>
              <button
                type="button"
                onClick={() => goTo(-1)}
                aria-label="Предыдущее фото"
                className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 text-foreground shadow-sm transition hover:bg-background"
              >
                <ChevronLeft className="h-5 w-5" aria-hidden />
              </button>
              <button
                type="button"
                onClick={() => goTo(1)}
                aria-label="Следующее фото"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-1.5 text-foreground shadow-sm transition hover:bg-background"
              >
                <ChevronRight className="h-5 w-5" aria-hidden />
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
