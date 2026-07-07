import React from "react";
import Image from "next/image";
import Link from "next/link";
import { BadgeCheck, Star } from "lucide-react";

import type { PublicRecipeListItem } from "@/features/recipes/contracts";
import { NEUTRAL_SOFT_GRADIENT, srmToHex, srmToSoftGradient } from "@/features/recipes/beer-color";
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
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground"
    >
      {initialsFromName(displayName)}
    </span>
  );
}

export function StatCell({
  label,
  value,
  className = ""
}: {
  label: string;
  value: string;
  /** Фикс-ширина/выравнивание для list-вида, где ячейки статов стоят колонками. */
  className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="truncate text-sm font-medium tabular-nums text-foreground">{value}</div>
    </div>
  );
}

/** Ячейка цвета: подпись «SRM» (единица числа) + точка реального оттенка пива. */
export function ColorStatCell({
  srm,
  className = "",
  align = "start"
}: {
  srm: number | null;
  /** Фикс-ширина/выравнивание для list-вида (колонки статов). */
  className?: string;
  align?: "start" | "end";
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">SRM</div>
      <div
        className={`flex items-center gap-1.5 text-sm font-medium tabular-nums text-foreground ${
          align === "end" ? "justify-end" : ""
        }`}
      >
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
  createdAt,
  variant = "inline"
}: {
  rating: PublicRecipeListItem["rating"];
  createdAt: string;
  /**
   * `inline` — текстовый рейтинг в строке (list-вид / тело карточки).
   * `overlay` — сплошной пилл с фоном, читаемый поверх обложки (grid-карточка).
   */
  variant?: "inline" | "overlay";
}) {
  if (rating) {
    if (variant === "overlay") {
      return (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-xs font-semibold text-foreground shadow-sm ring-1 ring-black/5 backdrop-blur-sm">
          <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden />
          {ratingFormatter.format(rating.average)}
          <span className="font-normal text-muted-foreground">({rating.count})</span>
        </span>
      );
    }
    return (
      <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-warning-subtle-foreground">
        <Star className="h-3.5 w-3.5 fill-amber-500 text-amber-500" aria-hidden />
        {ratingFormatter.format(rating.average)}
        <span className="text-muted-foreground">({rating.count})</span>
      </span>
    );
  }
  if (isRecentlyCreated(createdAt)) {
    if (variant === "overlay") {
      return (
        <span className="inline-flex shrink-0 items-center rounded-full bg-success px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm">
          Новый
        </span>
      );
    }
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-success-subtle px-2 py-0.5 text-[11px] font-medium text-success-subtle-foreground">
        Новый
      </span>
    );
  }
  return null;
}

/**
 * Бейдж «Выбор редакции» — кураторская метка (ставит editor+). Показывается
 * независимо от рейтинга/«Нового» (это отдельный слот). `overlay` — читаемый
 * поверх обложки в grid; `inline` — в теле карточки/строке list.
 */
export function FeaturedBadge({ variant = "inline" }: { variant?: "inline" | "overlay" }) {
  const base = "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold";
  const skin =
    variant === "overlay"
      ? "bg-warning text-white shadow-sm"
      : "bg-warning-subtle text-warning-subtle-foreground";
  return (
    <span className={`${base} ${skin}`}>
      <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
      Выбор редакции
    </span>
  );
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
    "inline-flex w-fit items-center rounded-full bg-muted px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground";
  if (styleHref) {
    return (
      <Link
        href={styleHref}
        className={`pointer-events-auto relative z-10 transition hover:bg-accent hover:text-foreground ${base} ${className}`}
      >
        {label}
      </Link>
    );
  }
  return <span className={`${base} ${className}`}>{label}</span>;
}

/**
 * Обложка рецепта: фото рецепта (резко) → фото BJCP-стиля (лёгкий блюр — не
 * выдаём общую стоковую картинку за фото самого рецепта, но и не тратим место
 * на пустое пятно) → мягкая заливка по SRM (редкий случай — рецепт вовсе без
 * стиля). `className` задаёт геометрию контейнера, `sizes` — атрибут next/image.
 */
export function RecipeThumb({
  heroImage,
  styleImageUrl,
  colorSrm,
  className,
  sizes,
  sharpenStyleOnHover = false,
  showColorMarker = true
}: {
  heroImage: PublicRecipeListItem["heroImage"];
  styleImageUrl: PublicRecipeListItem["styleImageUrl"];
  colorSrm: PublicRecipeListItem["colorSrm"];
  className: string;
  sizes: string;
  /** list-вид (вариант B): размытое фото стиля резчеет на ховере (только мышь). */
  sharpenStyleOnHover?: boolean;
  /** Метка цвета снизу. Выкл для крошечных миниатюр списка (цвет там — пиллом в тексте). */
  showColorMarker?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Фоновый слой: фото рецепта (резко, с лёгким зумом на ховере) → фото стиля
          (мягкий блюр-бэкдроп) → заливка-градиент по SRM. */}
      {heroImage ? (
        <Image
          src={heroImage.thumbUrl}
          alt=""
          aria-hidden
          fill
          unoptimized
          sizes={sizes}
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          placeholder={heroImage.blurDataUrl ? "blur" : "empty"}
          blurDataURL={heroImage.blurDataUrl ?? undefined}
        />
      ) : styleImageUrl ? (
        <Image
          src={styleImageUrl}
          alt=""
          aria-hidden
          fill
          unoptimized
          sizes={sizes}
          className={`scale-105 object-cover blur-[2px] transition duration-300 ${
            sharpenStyleOnHover ? "[@media(hover:hover)]:group-hover:scale-100 [@media(hover:hover)]:group-hover:blur-0" : ""
          }`}
        />
      ) : (
        <span
          aria-hidden
          className="absolute inset-0"
          style={{
            backgroundImage:
              colorSrm != null && Number.isFinite(colorSrm) ? srmToSoftGradient(colorSrm) : NEUTRAL_SOFT_GRADIENT
          }}
        />
      )}

      {/* Затемнение + метка цвета (SRM + оттенок) — ОДНА, одинаково снизу для всех
          типов обложки. Фикс рассинхрона: раньше fill-вариант (без фото) центрировался,
          а overlay прижимался книзу, отчего карточки вроде Gose «разъезжались».
          На крошечных миниатюрах списка метку отключаем (showColorMarker=false) —
          цвет там показывается пиллом в тексте строки. */}
      {showColorMarker ? (
        <>
          <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
          <RecipeColorSwatch srm={colorSrm} variant="overlay" className="absolute inset-x-0 bottom-0" />
        </>
      ) : null}
    </div>
  );
}
