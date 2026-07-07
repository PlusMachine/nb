"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp, ImagePlus, Star, Trash2 } from "lucide-react";

import { useToast } from "@nb/ui";
import {
  MASTER_IMAGE_MAX_FILE_BYTES,
  masterImageAcceptedMimeTypes
} from "@/features/masters/contracts";
import type { MasterImageDto } from "@/features/masters/images";

import { deleteMasterImageAction, reorderMasterImagesAction } from "./actions";

// Аплоадер+галерея одного «скоупа» фото мастера: либо общая галерея работ
// (itemId=null), либо фото конкретного изделия. По образцу
// components/recipes/recipe-images-section.tsx + recipe-image-uploader.tsx,
// но без dnd-kit — перестановка кнопками вверх/вниз (см. ТЗ §6), поэтому своя,
// более лёгкая реализация вместо переиспользования recipe-компонентов 1:1.

export type MasterImageCardItem = MasterImageDto & {
  localFile?: File | null;
  localPreviewUrl?: string | null;
  progress?: number;
  errorMessage?: string | null;
  canRetry?: boolean;
  isLocalOnly?: boolean;
};

const acceptedMimeTypeSet = new Set<string>(masterImageAcceptedMimeTypes);

const sortItems = (items: MasterImageCardItem[]) => [...items].sort((a, b) => {
  const orderDiff = a.sortOrder - b.sortOrder;
  return orderDiff !== 0 ? orderDiff : a.createdAt.getTime() - b.createdAt.getTime();
});

const buildLocalItem = ({
  file,
  status,
  message,
  canRetry
}: {
  file: File;
  status: MasterImageCardItem["status"];
  message?: string | null;
  canRetry?: boolean;
}): MasterImageCardItem => ({
  id: `temp-${crypto.randomUUID()}`,
  profileId: "",
  itemId: null,
  sortOrder: Number.MAX_SAFE_INTEGER,
  blurDataUrl: null,
  status,
  thumbUrl: null,
  mediumUrl: null,
  largeUrl: null,
  originalUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  localFile: file,
  localPreviewUrl: URL.createObjectURL(file),
  progress: status === "uploading" ? 0 : 100,
  errorMessage: message ?? null,
  canRetry,
  isLocalOnly: true
});

const parseUploadResponse = (responseText: string) => {
  if (!responseText) {
    return {};
  }
  try {
    return JSON.parse(responseText) as { ok?: boolean; message?: string; image?: MasterImageDto };
  } catch {
    return {};
  }
};

export function MasterImageManager({
  itemId,
  images,
  onChange,
  disabled,
  atProfileLimit,
  emptyLabel,
  scopeMaxCount,
  coverImageId,
  onSetCover
}: {
  itemId: string | null;
  images: MasterImageDto[];
  onChange: (images: MasterImageDto[]) => void;
  disabled: boolean;
  atProfileLimit: boolean;
  emptyLabel: string;
  scopeMaxCount?: number;
  coverImageId?: string | null;
  onSetCover?: (imageId: string | null) => void;
}) {
  const toast = useToast();
  const [items, setItems] = useState<MasterImageCardItem[]>(() => sortItems(images));
  const [sectionError, setSectionError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const uploadRequestsRef = useRef<Record<string, XMLHttpRequest>>({});

  useEffect(() => {
    setItems(sortItems(images));
  }, [images]);

  useEffect(() => () => {
    Object.values(uploadRequestsRef.current).forEach((request) => request.abort());
  }, []);

  const commitList = useCallback((next: MasterImageCardItem[]) => {
    const sorted = sortItems(next);
    setItems(sorted);
    onChange(sorted.filter((item) => !item.isLocalOnly));
  }, [onChange]);

  const replaceItem = useCallback((sourceId: string, next: MasterImageCardItem) => {
    setItems((current) => {
      const updated = sortItems(current.map((item) => (item.id === sourceId ? next : item)));
      onChange(updated.filter((item) => !item.isLocalOnly));
      return updated;
    });
  }, [onChange]);

  const uploadFile = useCallback((file: File, sourceId: string, retryImageId?: string) => new Promise<void>((resolve) => {
    const xhr = new XMLHttpRequest();
    uploadRequestsRef.current[sourceId] = xhr;
    xhr.open("POST", "/api/master-images/upload");
    xhr.onload = () => {
      delete uploadRequestsRef.current[sourceId];
      const response = parseUploadResponse(xhr.responseText);

      if (xhr.status >= 200 && xhr.status < 300 && response.ok && response.image) {
        replaceItem(sourceId, {
          ...response.image,
          errorMessage: null,
          localFile: null,
          localPreviewUrl: null,
          progress: 100,
          isLocalOnly: false
        });
        resolve();
        return;
      }

      const message = response.message?.trim() || "Не удалось загрузить.";
      const retryable = xhr.status >= 500;

      replaceItem(sourceId, response.image
        ? {
          ...response.image,
          errorMessage: message,
          localFile: retryable ? file : null,
          canRetry: retryable,
          progress: 0,
          isLocalOnly: false
        }
        : {
          ...buildLocalItem({ file, status: "failed", message, canRetry: retryable }),
          id: sourceId
        });

      if (!retryImageId && xhr.status === 400) {
        setSectionError(message);
      }

      resolve();
    };

    xhr.onerror = () => {
      delete uploadRequestsRef.current[sourceId];
      replaceItem(sourceId, {
        ...buildLocalItem({ file, status: "failed", message: "Не удалось загрузить. Попробуйте еще раз.", canRetry: true }),
        id: sourceId
      });
      resolve();
    };

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }
      const progress = Math.min(95, Math.round((event.loaded / event.total) * 100));
      setItems((current) => current.map((item) => (item.id === sourceId ? { ...item, progress } : item)));
    };

    const formData = new FormData();
    if (itemId) {
      formData.set("itemId", itemId);
    }
    if (retryImageId) {
      formData.set("imageId", retryImageId);
    }
    formData.set("file", file);
    xhr.send(formData);
  }), [itemId, replaceItem]);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (!files.length) {
      return;
    }

    setSectionError(null);

    if (disabled) {
      return;
    }

    const activeCount = items.filter((item) => item.status !== "failed" || !item.isLocalOnly).length;
    const limit = scopeMaxCount ?? Infinity;

    if (atProfileLimit || activeCount >= limit) {
      setSectionError(scopeMaxCount ? `Лимит: ${scopeMaxCount} фото для этого изделия.` : "Достигнут общий лимит фотографий витрины (24).");
      return;
    }

    const uploads: Array<{ file: File; sourceId: string }> = [];
    const localFailures: MasterImageCardItem[] = [];
    let remaining = atProfileLimit ? 0 : Math.max(0, limit - activeCount);
    let skippedByLimit = 0;

    for (const file of files) {
      if (!acceptedMimeTypeSet.has(file.type)) {
        localFailures.push(buildLocalItem({ file, status: "failed", message: "Нужен JPG, PNG или WEBP.", canRetry: false }));
        continue;
      }
      if (file.size > MASTER_IMAGE_MAX_FILE_BYTES) {
        localFailures.push(buildLocalItem({ file, status: "failed", message: "Файл больше 10 МБ.", canRetry: false }));
        continue;
      }
      if (remaining <= 0) {
        skippedByLimit += 1;
        continue;
      }
      remaining -= 1;
      const localItem = buildLocalItem({ file, status: "uploading" });
      uploads.push({ file, sourceId: localItem.id });
      setItems((current) => sortItems([...current, localItem]));
    }

    if (skippedByLimit > 0) {
      setSectionError(scopeMaxCount ? `Лимит: ${scopeMaxCount} фото для этого изделия. Лишние файлы не загружали.` : "Общий лимит фотографий витрины — 24. Лишние файлы не загружали.");
    }

    if (localFailures.length) {
      setItems((current) => sortItems([...current, ...localFailures]));
    }

    await Promise.all(uploads.map(({ file, sourceId }) => uploadFile(file, sourceId)));
  }, [atProfileLimit, disabled, items, scopeMaxCount, uploadFile]);

  const handleRetry = useCallback(async (item: MasterImageCardItem) => {
    if (!item.localFile || item.canRetry === false || disabled) {
      return;
    }
    setSectionError(null);
    await uploadFile(item.localFile, item.id, item.isLocalOnly ? undefined : item.id);
  }, [disabled, uploadFile]);

  const handleDelete = useCallback(async (item: MasterImageCardItem) => {
    setSectionError(null);

    if (item.isLocalOnly) {
      commitList(items.filter((candidate) => candidate.id !== item.id));
      return;
    }

    const result = await deleteMasterImageAction(item.id);
    if (!result.ok) {
      setSectionError(result.error);
      toast.show({ title: "Не удалось удалить фото", description: result.error, tone: "danger" });
      return;
    }

    commitList(items.filter((candidate) => candidate.id !== item.id));
  }, [commitList, items, toast]);

  const handleMove = useCallback(async (item: MasterImageCardItem, direction: -1 | 1) => {
    const readyItems = items.filter((candidate) => !candidate.isLocalOnly);
    const index = readyItems.findIndex((candidate) => candidate.id === item.id);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= readyItems.length) {
      return;
    }

    const reordered = [...readyItems];
    [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];
    const orderedIds = reordered.map((candidate) => candidate.id);

    setSectionError(null);
    const previous = items;
    commitList(reordered.map((candidate, idx) => ({ ...candidate, sortOrder: idx })));

    const result = await reorderMasterImagesAction({ itemId, imageIds: orderedIds });
    if (!result.ok) {
      commitList(previous);
      setSectionError(result.error);
      return;
    }

    commitList(result.images);
  }, [commitList, itemId, items]);

  const readyOrPendingItems = items;

  return (
    <div className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(event) => {
          if (event.target.files?.length) {
            void handleFilesSelected(Array.from(event.target.files));
          }
          if (inputRef.current) {
            inputRef.current.value = "";
          }
        }}
      />

      {readyOrPendingItems.length ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
          {readyOrPendingItems.map((item, index) => {
            const previewUrl = item.thumbUrl ?? item.localPreviewUrl ?? item.mediumUrl ?? null;
            const isCover = Boolean(coverImageId && coverImageId === item.id);

            return (
              <div key={item.id} className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-muted shadow-sm">
                {previewUrl ? (
                  <Image
                    src={previewUrl}
                    alt="Фото мастера"
                    fill
                    unoptimized
                    sizes="200px"
                    className="object-cover"
                    placeholder={item.blurDataUrl ? "blur" : "empty"}
                    blurDataURL={item.blurDataUrl ?? undefined}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center px-2 text-center text-[11px] text-muted-foreground">Загрузка…</div>
                )}

                {isCover ? (
                  <span className="pointer-events-none absolute left-1.5 top-1.5 inline-flex items-center rounded-full bg-foreground/70 px-2 py-0.5 text-[10px] font-medium text-background">
                    Обложка
                  </span>
                ) : null}

                {!disabled ? (
                  <div className="pointer-events-none absolute right-1.5 top-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    {onSetCover && item.status === "ready" && !isCover ? (
                      <button
                        type="button"
                        aria-label="Сделать обложкой"
                        title="Сделать обложкой"
                        className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/70 text-background hover:bg-foreground/90"
                        onClick={() => onSetCover(item.id)}
                      >
                        <Star className="h-3.5 w-3.5" />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      aria-label="Удалить фото"
                      title="Удалить"
                      className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full bg-foreground/70 text-background hover:bg-destructive"
                      onClick={() => void handleDelete(item)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}

                {!disabled && item.status === "ready" ? (
                  <div className="pointer-events-none absolute bottom-1.5 left-1.5 flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
                    <button
                      type="button"
                      aria-label="Переместить раньше"
                      disabled={index === 0}
                      className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background disabled:opacity-30"
                      onClick={() => void handleMove(item, -1)}
                    >
                      <ChevronUp className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Переместить позже"
                      disabled={index === readyOrPendingItems.length - 1}
                      className="pointer-events-auto inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground/70 text-background disabled:opacity-30"
                      onClick={() => void handleMove(item, 1)}
                    >
                      <ChevronDown className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : null}

                {item.status === "uploading" ? (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-card/90 px-2 py-1.5">
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${item.progress ?? 0}%` }} />
                    </div>
                  </div>
                ) : null}

                {item.status === "failed" ? (
                  <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-1 bg-card/95 px-1.5 py-1.5">
                    <p className="min-w-0 truncate text-[10px] font-medium text-destructive">{item.errorMessage ?? "Ошибка"}</p>
                    <div className="flex shrink-0 gap-1">
                      {item.canRetry !== false ? (
                        <button
                          type="button"
                          className="rounded-full bg-foreground px-2 py-0.5 text-[10px] font-medium text-background"
                          onClick={() => void handleRetry(item)}
                        >
                          Повторить
                        </button>
                      ) : null}
                      <button
                        type="button"
                        className="rounded-full bg-destructive-subtle px-2 py-0.5 text-[10px] font-medium text-destructive-subtle-foreground"
                        onClick={() => void handleDelete(item)}
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      )}

      {!disabled ? (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-sm transition hover:bg-accent"
        >
          <ImagePlus className="h-4 w-4" />
          Загрузить фото
        </button>
      ) : null}

      {sectionError ? <p className="text-sm text-destructive">{sectionError}</p> : null}
    </div>
  );
}
