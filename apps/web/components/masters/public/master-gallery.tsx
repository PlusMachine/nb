"use client";

import { useState } from "react";

import type { MasterPublishedSnapshotImageRef } from "@/features/masters/contracts";

import { MasterGalleryLightbox } from "./master-gallery-lightbox";
import { MasterImage } from "./master-image";

/** Грид миниатюр «Галерея работ» (§6 ТЗ) — клик по миниатюре открывает лайтбокс на этом фото. */
export function MasterGallery({ images }: { images: MasterPublishedSnapshotImageRef[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (images.length === 0) {
    return null;
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((image, index) => (
          <button
            key={image.imageId}
            type="button"
            onClick={() => setOpenIndex(index)}
            aria-label="Открыть фото"
            className="rounded-xl ring-1 ring-inset ring-black/5 transition hover:opacity-90"
          >
            <MasterImage imageRef={image} variant="thumb" alt="Фото работы мастера" className="aspect-square w-full rounded-xl" sizes="200px" />
          </button>
        ))}
      </div>
      <MasterGalleryLightbox images={images} openIndex={openIndex} onClose={() => setOpenIndex(null)} />
    </>
  );
}
