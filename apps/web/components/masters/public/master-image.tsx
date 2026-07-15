"use client";

import { useState } from "react";
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
 * Фото нет → нейтральная заливка токеном `bg-muted` с приглушённой иконкой
 * молотка (`text-muted-foreground/60`) — без текста, корректный контраст
 * в обеих темах (в отличие от голого hex-градиента SRM-фолбэка рецептов).
 */

export function MasterImageFallback({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`absolute inset-0 flex items-center justify-center bg-muted ${className}`}>
      <Hammer className="h-8 w-8 text-muted-foreground/60" />
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
  const [failed, setFailed] = useState(false);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {imageRef && !failed ? (
        <Image
          src={buildMasterImageVariantUrl(imageRef.imageId, variant)}
          alt={alt}
          fill
          unoptimized
          sizes={sizes}
          className="object-cover"
          placeholder={imageRef.blurDataUrl ? "blur" : "empty"}
          blurDataURL={imageRef.blurDataUrl ?? undefined}
          onError={() => setFailed(true)}
        />
      ) : (
        <MasterImageFallback />
      )}
    </div>
  );
}
