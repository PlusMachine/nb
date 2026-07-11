import Link from "next/link";
import { MapPin } from "lucide-react";

import type { MarketItemCardDto } from "@/features/masters/contracts";

import { MasterImage } from "./master-image";

// Карточка товара на /market. Как и бывшая карточка мастера: без вложенных
// интерактивных элементов — вся карточка сама и есть <Link> (см. articles/page.tsx
// для того же паттерна), одна высота — flex h-full flex-col на гриде.
// Ведёт к изделию на странице мастера (якорь #item-<id>).
export function MarketItemCard({ item }: { item: MarketItemCardDto }) {
  return (
    <Link
      href={`/masters/${item.masterSlug}#item-${item.itemId}`}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition hover:shadow-md"
    >
      <MasterImage
        imageRef={item.coverImage}
        variant="medium"
        alt={item.title}
        className="aspect-[4/3] w-full shrink-0"
        sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
      />

      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="line-clamp-2 text-base font-semibold leading-snug text-foreground group-hover:text-foreground/80">
            {item.title}
          </h2>
          {item.priceNote ? (
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">
              {item.priceNote}
            </span>
          ) : null}
        </div>

        <span className="mt-auto inline-flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
          <span className="truncate">{item.masterDisplayName}</span>
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="truncate">{item.masterCity}</span>
        </span>
      </div>
    </Link>
  );
}
