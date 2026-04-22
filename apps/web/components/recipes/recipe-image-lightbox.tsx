"use client";

import Lightbox from "yet-another-react-lightbox";

import type { RecipeImageCardItem } from "./recipe-image-card";

export function RecipeImageLightbox({
  items,
  openIndex,
  onClose
}: {
  items: RecipeImageCardItem[];
  openIndex: number;
  onClose: () => void;
}) {
  const slides = items
    .filter((item) => item.status === "ready" && (item.largeUrl || item.mediumUrl))
    .map((item) => ({
      src: item.largeUrl ?? item.mediumUrl ?? item.thumbUrl ?? "",
      alt: item.effectiveAltText
    }));

  if (!slides.length) {
    return null;
  }

  return (
    <Lightbox
      open={openIndex >= 0}
      index={openIndex}
      close={onClose}
      slides={slides}
      controller={{
        closeOnBackdropClick: true
      }}
    />
  );
}
