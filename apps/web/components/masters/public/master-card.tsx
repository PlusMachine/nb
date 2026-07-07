import Link from "next/link";
import { MapPin } from "lucide-react";

import { getMasterSpecializationLabel } from "@/features/masters/contracts";
import type { MasterCardDto } from "@/features/masters/service";

import { MasterImage } from "./master-image";

// Карточка витрины /masters (§6 ТЗ). В отличие от RecipeCard, здесь нет
// вложенных интерактивных элементов (нет ни чипа-ссылки, ни кнопок) — вся
// карточка сама и есть <Link>, без stretched-link трюка (см. articles/page.tsx
// для того же паттерна). Одна высота карточек — flex h-full flex-col на гриде.

const MAX_VISIBLE_SPECIALIZATIONS = 3;

const chipClassName =
  "inline-flex w-fit items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground";

export function MasterCard({ master }: { master: MasterCardDto }) {
  const visibleSpecializations = master.specializations.slice(0, MAX_VISIBLE_SPECIALIZATIONS);
  const hiddenCount = master.specializations.length - visibleSpecializations.length;

  return (
    <Link
      href={`/masters/${master.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md"
    >
      <MasterImage
        imageRef={master.coverImage}
        variant="medium"
        alt={master.displayName}
        className="aspect-[4/3] w-full shrink-0"
        sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h2 className="line-clamp-1 text-lg font-semibold text-foreground group-hover:text-foreground/80">
          {master.displayName}
        </h2>
        <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{master.city}</span>
        </span>

        {visibleSpecializations.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {visibleSpecializations.map((key) => (
              <span key={key} className={chipClassName}>
                {getMasterSpecializationLabel(key)}
              </span>
            ))}
            {hiddenCount > 0 ? <span className={chipClassName}>+{hiddenCount}</span> : null}
          </div>
        ) : null}

        <p className="line-clamp-2 text-sm text-muted-foreground">{master.summary}</p>
      </div>
    </Link>
  );
}
