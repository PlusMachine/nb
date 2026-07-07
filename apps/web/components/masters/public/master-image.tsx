import Image from "next/image";
import { Hammer } from "lucide-react";

import {
  buildMasterImageVariantUrl,
  type MasterImageVariant,
  type MasterPublishedSnapshotImageRef
} from "@/features/masters/contracts";

/**
 * Обложка мастера/изделия/миниатюра галереи (публичная витрина, §6 ТЗ).
 * Самодостаточный контейнер по образцу {@link RecipeThumb}
 * (`components/recipes/recipe-card-parts.tsx`): `className` задаёт геометрию
 * (`aspect-*`/`h-*`/`w-*`), сам компонент кладёт `relative overflow-hidden`.
 * Фото нет → спокойная нейтральная заливка с приглушённой иконкой молотка —
 * без текста, в духе SRM-фолбэка карточки рецепта.
 */

const FALLBACK_GRADIENT = "linear-gradient(150deg, #f5f5f4 0%, #e7e5e4 60%, #d6d3d1 100%)";

export function MasterImageFallback({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`absolute inset-0 flex items-center justify-center ${className}`}
      style={{ backgroundImage: FALLBACK_GRADIENT }}
    >
      <Hammer className="h-8 w-8 text-foreground/20" />
    </div>
  );
}

export function MasterImage({
  imageRef,
  variant,
  alt,
  className = "",
  sizes
}: {
  imageRef: MasterPublishedSnapshotImageRef | null;
  variant: MasterImageVariant;
  alt: string;
  /** Геометрия контейнера, например `aspect-[4/3] w-full`. */
  className?: string;
  sizes: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {imageRef ? (
        <Image
          src={buildMasterImageVariantUrl(imageRef.imageId, variant)}
          alt={alt}
          fill
          unoptimized
          sizes={sizes}
          className="object-cover"
          placeholder={imageRef.blurDataUrl ? "blur" : "empty"}
          blurDataURL={imageRef.blurDataUrl ?? undefined}
        />
      ) : (
        <MasterImageFallback />
      )}
    </div>
  );
}
