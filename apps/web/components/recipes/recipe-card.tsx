import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Star } from "lucide-react";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { formatAbvShort, formatBatchVolume, formatIbuShort, formatOgShort } from "@/features/recipes/format";

import { RecipeColorSwatch } from "./recipe-color-swatch";
import { RecipeSaveButton } from "./recipe-save-button";

const ratingFormatter = new Intl.NumberFormat("ru-RU", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1
});

/** Инициалы автора для аватара-фолбэка (настоящих аватаров обычно нет). */
const initialsFromName = (displayName: string | null): string => {
  const name = displayName?.trim();
  if (!name) {
    return "?";
  }
  const parts = name.split(/\s+/).filter(Boolean);
  const letters = parts.length >= 2 ? `${parts[0][0]}${parts[1][0]}` : name.slice(0, 2);
  return letters.toUpperCase();
};

function AuthorAvatar({ image, displayName }: { image: string | null; displayName: string | null }) {
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

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</div>
      <div className="truncate text-sm font-medium tabular-nums text-zinc-900">{value}</div>
    </div>
  );
}

/**
 * Карточка публичного рецепта (§6 ТЗ) — серверный компонент, без доменной логики:
 * все данные берутся из {@link PublicRecipeListItem}. Вся карточка — доступная
 * ссылка на `/recipes/[slug]`.
 */
export function RecipeCard({ recipe }: { recipe: PublicRecipeListItem }) {
  const authorName = recipe.author.displayName ?? "Автор";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm transition hover:border-zinc-300 hover:shadow-md">
      <Link href={`/recipes/${recipe.slug}`} className="flex h-full flex-col focus:outline-none">
        {/* Обложка: фото рецепта → размытое фото BJCP-стиля → мягкая заливка по SRM */}
        <div className="relative aspect-[4/3] w-full overflow-hidden">
          {recipe.heroImage ? (
            <Image
              src={recipe.heroImage.thumbUrl}
              alt=""
              aria-hidden
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 320px"
              className="object-cover"
              placeholder={recipe.heroImage.blurDataUrl ? "blur" : "empty"}
              blurDataURL={recipe.heroImage.blurDataUrl ?? undefined}
            />
          ) : recipe.styleImageUrl ? (
            <>
              <Image
                src={recipe.styleImageUrl}
                alt=""
                aria-hidden
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 320px"
                className="scale-110 object-cover blur-[6px]"
              />
              {/* Затемнение снизу — читаемость подписи SRM поверх любого фото. */}
              <span
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/15 to-transparent"
              />
              <RecipeColorSwatch srm={recipe.colorSrm} variant="overlay" className="absolute inset-x-0 bottom-0" />
            </>
          ) : (
            <RecipeColorSwatch srm={recipe.colorSrm} className="h-full w-full" />
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2 p-4">
          {recipe.style ? (
            <span className="inline-flex w-fit items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-[11px] font-medium text-zinc-600">
              {recipe.style.name} · {recipe.style.code}
            </span>
          ) : null}

          <h2 className="line-clamp-2 text-base font-semibold leading-snug text-zinc-950 group-hover:text-zinc-700">
            {recipe.name}
          </h2>

          <div className="mt-auto flex items-center justify-between gap-2 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <AuthorAvatar image={recipe.author.image} displayName={recipe.author.displayName} />
              <span className="truncate text-xs text-zinc-600">{authorName}</span>
            </div>
            {recipe.rating ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-amber-600">
                <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden />
                {ratingFormatter.format(recipe.rating.average)}
                <span className="text-zinc-400">({recipe.rating.count})</span>
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                Новый
              </span>
            )}
          </div>

          <div className="grid grid-cols-4 gap-2 border-t border-zinc-100 pt-3">
            <StatCell label="ABV" value={formatAbvShort(recipe.abv)} />
            <StatCell label="IBU" value={formatIbuShort(recipe.ibu)} />
            <StatCell label="OG" value={formatOgShort(recipe.og)} />
            <StatCell label="Объём" value={formatBatchVolume(recipe.batchSizeL)} />
          </div>
        </div>
      </Link>
      {/* Флажок «Сохранить» — сиблинг ссылки (нельзя вкладывать кнопку в <a>),
          абсолютно поверх обложки. */}
      <RecipeSaveButton recipeId={recipe.id} slug={recipe.slug} />
    </article>
  );
}
