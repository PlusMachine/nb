import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { srmToHex } from "@/features/recipes/beer-color";
import { isRecentlyCreated } from "@/features/recipes/format";

import { RecipeColorSwatch } from "./recipe-color-swatch";

/**
 * Общие презентационные части карточки и строки витрины `/recipes` (серверные,
 * без доменной логики). Вынесены, чтобы grid- и list-вид показывали одни и те же
 * данные одинаково: аватар автора, числовые ячейки, рейтинг/«Новый», чип стиля,
 * обложку.
 */

const ratingFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

/** Инициалы автора для аватара-фолбэка (настоящих аватаров обычно нет). */
export const initialsFromName = (displayName: string | null): string => {
  const name = displayName?.trim();
  if (!name) {
    return "?";
  }
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return letters.toUpperCase();
};

export function AuthorAvatar({ image, displayName }: { image: string | null; displayName: string | null }) {
  if (image) {
    return (
      <Image
        src={image}
        alt=""
        aria-hidden
        width={24}
        height={24}
        unoptimized
        className="h-6 w-6 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-600"
    >
      {initialsFromName(displayName)}
    </span>
  );
}

export function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="truncate text-sm font-medium tabular-nums text-zinc-900">{value}</div>
    </div>
  );
}

/** Ячейка цвета: SRM-число + точка реального оттенка пива. */
export function ColorStatCell({ srm }: { srm: number | null }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-zinc-400">Цвет</div>
      <div className="flex items-center gap-1.5 text-sm font-medium tabular-nums text-zinc-900">
        {srm == null ? (
          "—"
        ) : (
          <>
            <span
              aria-hidden
              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-inset ring-black/10"
              style={{ backgroundColor: srmToHex(srm) }}
            />
            {Math.round(srm * 10) / 10}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Рейтинг рецепта, иначе бейдж «Новый» для недавно созданных, иначе ничего.
 * «Новый» решается по дате создания ({@link isRecentlyCreated}), а не по
 * отсутствию оценок.
 */
export function RecipeRatingOrNew({
  rating,
  createdAt
}: {
  rating: PublicRecipeListItem["rating"];
  createdAt: string;
}) {
  if (rating) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600">
        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden />
        {ratingFormatter.format(rating.average)}
        <span className="text-zinc-400">({rating.count})</span>
      </span>
    );
  }
  if (isRecentlyCreated(createdAt)) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
        Новый
      </span>
    );
  }
  return null;
}

/**
 * Чип стиля. Если есть `styleHref` — ссылка на BJCP-страницу стиля (лежит поверх
 * stretched-link карточки, поэтому `relative z-10` + `pointer-events-auto`);
 * иначе обычный бейдж. `null`, если стиля нет.
 */
export function StyleChip({
  style,
  styleHref,
  className = ""
}: {
  style: PublicRecipeListItem["style"];
  styleHref: string | null;
  className?: string;
}) {
  if (!style) {
    return null;
  }
  const label = `${style.name} · ${style.code}`;
  const base =
    "inline-flex w-fit items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600";
  if (styleHref) {
    return (
      <Link
        href={styleHref}
        className={`pointer-events-auto relative z-10 transition hover:bg-zinc-200 hover:text-zinc-900 ${base} ${className}`}
      >
        {label}
      </Link>
    );
  }
  return <span className={`${base} ${className}`}>{label}</span>;
}

/**
 * Обложка рецепта: фото рецепта → размытое фото BJCP-стиля → мягкая заливка по
 * SRM. `className` задаёт геометрию контейнера, `sizes` — атрибут next/image.
 */
export function RecipeThumb({
  heroImage,
  styleImageUrl,
  colorSrm,
  className,
  sizes
}: {
  heroImage: PublicRecipeListItem["heroImage"];
  styleImageUrl: PublicRecipeListItem["styleImageUrl"];
  colorSrm: PublicRecipeListItem["colorSrm"];
  className: string;
  sizes: string;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {heroImage ? (
        <Image
          src={heroImage.thumbUrl}
          alt=""
          aria-hidden
          fill
          unoptimized
          sizes={sizes}
          className="object-cover"
          placeholder={heroImage.blurDataUrl ? "blur" : "empty"}
          blurDataURL={heroImage.blurDataUrl ?? undefined}
        />
      ) : styleImageUrl ? (
        <>
          <Image
            src={styleImageUrl}
            alt=""
            aria-hidden
            fill
            unoptimized
            sizes={sizes}
            className="scale-110 object-cover blur-[6px]"
          />
          {/* Затемнение снизу — читаемость подписи SRM поверх любого фото. */}
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent" />
          <RecipeColorSwatch srm={colorSrm} variant="overlay" className="absolute inset-x-0 bottom-0" />
        </>
      ) : (
        <RecipeColorSwatch srm={colorSrm} className="h-full w-full" />
      )}
    </div>
  );
}
