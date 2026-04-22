"use client";

import type { DraggableAttributes } from "@dnd-kit/core";
import type { SyntheticListenerMap } from "@dnd-kit/core/dist/hooks/utilities";
import { GripVertical, Star, Trash2 } from "lucide-react";
import Image from "next/image";

import type { RecipeImageDto } from "@/features/recipe-images/contracts";

import { RecipeImageActionsMenu } from "./recipe-image-actions-menu";

export type RecipeImageCardItem = RecipeImageDto & {
  errorMessage?: string | null;
  localFile?: File | null;
  localPreviewUrl?: string | null;
  progress?: number;
  canRetry?: boolean;
  isLocalOnly?: boolean;
};

const desktopActionClassName = "pointer-events-auto hidden h-8 w-8 items-center justify-center rounded-full bg-zinc-950/60 text-white opacity-0 backdrop-blur-sm transition hover:bg-zinc-950/85 md:inline-flex md:group-hover:opacity-100";

export function RecipeImageCard({
  item,
  variant = "grid",
  reorderMode = false,
  dragAttributes,
  dragListeners,
  onDelete,
  onOpen,
  onRetry,
  onSetCover
}: {
  item: RecipeImageCardItem;
  variant?: "cover" | "grid" | "rail" | "thumb";
  reorderMode?: boolean;
  dragAttributes?: DraggableAttributes;
  dragListeners?: SyntheticListenerMap;
  onDelete?: () => void;
  onOpen?: () => void;
  onRetry?: () => void;
  onSetCover?: () => void;
}) {
  const previewUrl = item.thumbUrl ?? item.localPreviewUrl ?? item.mediumUrl ?? item.largeUrl ?? null;
  const isReady = item.status === "ready";
  const isFailed = item.status === "failed";
  const isUploading = item.status === "uploading";
  const canRetry = isFailed && item.canRetry !== false && Boolean(onRetry);

  const heightClassName = variant === "cover"
    ? "h-72 sm:h-80 lg:h-[25rem]"
    : variant === "thumb"
      ? "h-full"
      : variant === "rail"
        ? "h-24 sm:h-28 lg:h-[7.55rem]"
        : "h-32 sm:h-36";

  const imageClassName = variant === "cover"
    ? "object-cover transition-transform duration-500 group-hover:scale-[1.03]"
    : "object-cover transition-transform duration-300 group-hover:scale-105";

  const shellClassName = variant === "cover"
    ? "rounded-2xl bg-zinc-100 shadow-none"
    : variant === "thumb"
      ? "bg-zinc-100 shadow-none"
      : variant === "rail"
        ? "rounded-2xl bg-zinc-100 shadow-none transition"
        : "rounded-2xl border border-zinc-100 bg-zinc-100 shadow-sm";

  const progressValue = Math.max(0, Math.min(100, Math.round(item.progress ?? 0)));
  const mobileMenuItems = [
    !item.isCover && isReady && onSetCover ? {
      key: "cover",
      label: "Сделать обложкой",
      onSelect: onSetCover
    } : null,
    canRetry && onRetry ? {
      key: "retry",
      label: "Повторить",
      onSelect: onRetry
    } : null,
    onDelete ? {
      key: "delete",
      label: "Удалить",
      tone: "danger" as const,
      onSelect: onDelete
    } : null
  ].filter((candidate): candidate is NonNullable<typeof candidate> => Boolean(candidate));

  return (
    <div className={`group relative overflow-hidden ${shellClassName} ${heightClassName}`}>
      {previewUrl ? (
        <button
          type="button"
          onClick={isReady ? onOpen : undefined}
          className={`relative block h-full w-full overflow-hidden ${isReady ? "cursor-zoom-in" : "cursor-default"}`}
        >
          <Image
            src={previewUrl}
            alt={item.effectiveAltText}
            fill
            unoptimized
            sizes={variant === "cover" ? "(max-width: 1024px) 100vw, 50vw" : "(max-width: 768px) 50vw, 200px"}
            className={imageClassName}
            placeholder={item.blurDataUrl ? "blur" : "empty"}
            blurDataURL={item.blurDataUrl ?? undefined}
          />
        </button>
      ) : (
        <div className="flex h-full items-center justify-center px-4 text-center text-xs text-zinc-400">
          Загрузка…
        </div>
      )}

      {item.isCover ? (
        <span className="pointer-events-none absolute left-3 top-3 inline-flex items-center rounded-full bg-zinc-950/55 px-2.5 py-1 text-[11px] font-medium text-white backdrop-blur-sm">
          Обложка
        </span>
      ) : null}

      {reorderMode ? (
        <button
          type="button"
          className="absolute left-3 top-3 hidden h-9 w-9 cursor-grab items-center justify-center rounded-full bg-white/90 text-zinc-600 shadow-sm ring-1 ring-black/5 md:inline-flex"
          {...dragAttributes}
          {...dragListeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      ) : null}

      {!reorderMode ? (
        <>
          <div className="absolute right-2 top-2 md:hidden">
            <RecipeImageActionsMenu items={mobileMenuItems} />
          </div>
          <div className="pointer-events-none absolute right-2 top-2 hidden items-center gap-1.5 md:flex">
            {!item.isCover && isReady && onSetCover ? (
              <button
                type="button"
                aria-label="Сделать обложкой"
                title="Сделать обложкой"
                className={desktopActionClassName}
                onClick={(event) => {
                  event.stopPropagation();
                  onSetCover();
                }}
              >
                <Star className="h-3.5 w-3.5" />
              </button>
            ) : null}
            {onDelete ? (
              <button
                type="button"
                aria-label="Удалить"
                title="Удалить"
                className="pointer-events-auto hidden h-8 w-8 items-center justify-center rounded-full bg-zinc-950/60 text-white opacity-0 backdrop-blur-sm transition hover:bg-rose-600 md:inline-flex md:group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onDelete();
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        </>
      ) : null}

      {isUploading ? (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-white/90 px-3 py-2 backdrop-blur-sm">
          {variant === "cover" ? (
            <>
              <div className="mb-1 flex items-center justify-between gap-3 text-[11px] font-medium text-zinc-600">
                <span>Загрузка</span>
                <span className="tabular-nums">{progressValue}%</span>
              </div>
            </>
          ) : null}
          <div className="h-1 overflow-hidden rounded-full bg-zinc-200">
            <div className="h-full rounded-full bg-zinc-800 transition-all" style={{ width: `${progressValue}%` }} />
          </div>
        </div>
      ) : null}

      {isFailed ? (
        <div className="absolute inset-x-0 bottom-0 bg-white/95 px-2.5 py-2 backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2">
            {variant === "cover" ? (
              <p className="min-w-0 text-xs font-medium leading-snug text-rose-700">
                {item.errorMessage ?? "Не удалось загрузить"}
              </p>
            ) : (
              <p className="min-w-0 truncate text-[10px] font-medium text-rose-700">
                Ошибка
              </p>
            )}
            <div className="flex shrink-0 items-center gap-1">
              {canRetry ? (
                <button
                  type="button"
                  className="inline-flex items-center rounded-full bg-zinc-900 px-2.5 py-1 text-[10px] font-medium text-white"
                  onClick={onRetry}
                >
                  Повторить
                </button>
              ) : null}
              {onDelete ? (
                <button
                  type="button"
                  className="inline-flex items-center rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-medium text-rose-700"
                  onClick={onDelete}
                >
                  Удалить
                </button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
