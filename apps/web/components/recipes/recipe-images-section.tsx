"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { ImageIcon, MoveVertical } from "lucide-react";

import {
  createRecipeDraftForImageUploadAction,
  deleteRecipeImageAction,
  reorderRecipeImagesAction,
  setRecipeCoverImageAction,
  type RecipeEditorPayload,
  type RecipeImageResult
} from "@/app/(app)/app/recipes/actions";
import type { RecipeDetailDto } from "@/features/recipes/contracts";
import type { RecipeImageDto } from "@/features/recipe-images/contracts";
import {
  recipeImageAcceptedMimeTypes,
  RECIPE_IMAGE_MAX_COUNT,
  RECIPE_IMAGE_MAX_FILE_BYTES,
  RECIPE_IMAGE_MAX_TOTAL_BYTES
} from "@/features/recipe-images/contracts";

import { RecipeImageGrid } from "./recipe-image-grid";
import { RecipeImageLightbox } from "./recipe-image-lightbox";
import { RecipeImageUploader } from "./recipe-image-uploader";
import type { RecipeImageCardItem } from "./recipe-image-card";

const acceptedMimeTypeSet = new Set<string>(recipeImageAcceptedMimeTypes);

const sortItems = (items: RecipeImageCardItem[]) => [...items].sort((left, right) => {
  const orderDiff = left.sortOrder - right.sortOrder;
  if (orderDiff !== 0) {
    return orderDiff;
  }

  return left.createdAt.getTime() - right.createdAt.getTime();
});

const buildLocalAltText = (recipeTitle: string) => `Фото рецепта «${recipeTitle.trim() || "Без названия"}»`;

type SectionNotice = {
  message: string;
};

const createLocalItem = ({
  canRetry,
  file,
  recipeId,
  recipeTitle,
  status,
  message
}: {
  canRetry?: boolean;
  file: File;
  recipeId: string;
  recipeTitle: string;
  status: RecipeImageCardItem["status"];
  message?: string | null;
}): RecipeImageCardItem => ({
  id: `temp-${crypto.randomUUID()}`,
  recipeId,
  width: null,
  height: null,
  mimeType: file.type || "image/jpeg",
  sizeBytes: file.size,
  blurDataUrl: null,
  caption: null,
  altText: null,
  effectiveAltText: buildLocalAltText(recipeTitle),
  sortOrder: Number.MAX_SAFE_INTEGER,
  isCover: false,
  status,
  createdAt: new Date(),
  updatedAt: new Date(),
  thumbUrl: null,
  mediumUrl: null,
  largeUrl: null,
  originalUrl: null,
  localFile: file,
  localPreviewUrl: URL.createObjectURL(file),
  progress: status === "uploading" ? 0 : 100,
  errorMessage: message ?? null,
  canRetry,
  isLocalOnly: true
});

const buildUploadErrorMessage = (file: File) => {
  if (!acceptedMimeTypeSet.has(file.type)) {
    return "Нужен JPG, PNG или WEBP.";
  }

  if (file.size > RECIPE_IMAGE_MAX_FILE_BYTES) {
    return "Файл больше 10 МБ.";
  }

  return null;
};

const parseUploadResponse = (responseText: string) => {
  if (!responseText) {
    return {};
  }

  try {
    return JSON.parse(responseText) as {
      ok?: boolean;
      message?: string;
      image?: RecipeImageDto;
    };
  } catch {
    return {};
  }
};

const resolveUploadFailureMessage = (message: string | undefined, status: number) => {
  if (message?.trim()) {
    return message;
  }

  if (status >= 500) {
    return "Не удалось загрузить. Попробуйте ещё раз.";
  }

  return "Не удалось загрузить";
};

const isCapacityFailureMessage = (message: string) => (
  message.includes("8 фотограф")
  || message.includes("40 МБ")
);

const buildCapacityNotice = (message: string) => (
  message.includes("40 МБ")
    ? "Часть фото не добавлена: общий лимит 40 МБ."
    : "Лимит: 8 фото. Лишние файлы не загружали."
);

const buildSelectionNotice = ({
  invalidCount,
  queuedCount,
  skippedByCount,
  skippedByTotalBytes
}: {
  invalidCount: number;
  queuedCount: number;
  skippedByCount: number;
  skippedByTotalBytes: number;
}) => {
  const messages: string[] = [];

  if (skippedByCount > 0) {
    messages.push(
      queuedCount > 0
        ? `Лимит: 8 фото. В очередь добавили ${queuedCount}, лишние не загружали.`
        : "Лимит: 8 фото. Удалите фото, чтобы добавить новые."
    );
  }

  if (skippedByTotalBytes > 0) {
    messages.push("Часть фото не добавлена: общий лимит 40 МБ.");
  }

  if (invalidCount > 0) {
    messages.push("Часть файлов не подходит. Причина указана на карточках.");
  }

  return messages.join(" ");
};

const countsTowardRecipeLimit = (item: RecipeImageCardItem) => (
  item.status !== "failed" || !item.isLocalOnly
);

const getActiveImageCount = (items: RecipeImageCardItem[]) => items.filter(countsTowardRecipeLimit).length;

const getActiveImageBytes = (items: RecipeImageCardItem[]) => items
  .filter(countsTowardRecipeLimit)
  .reduce((sum, item) => sum + item.sizeBytes, 0);

const replaceItem = (
  items: RecipeImageCardItem[],
  sourceId: string,
  nextItem: RecipeImageCardItem
) => sortItems(items.map((item) => item.id === sourceId ? nextItem : item));

export function RecipeImagesSection({
  draftSeed,
  initialImages = [],
  recipeId,
  recipeTitle,
  onRecipeCreated
}: {
  draftSeed: Partial<RecipeEditorPayload>;
  initialImages?: RecipeImageDto[];
  recipeId: string | null;
  recipeTitle: string;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
}) {
  const [images, setImages] = useState<RecipeImageCardItem[]>(() => sortItems(initialImages));
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const [reorderMode, setReorderMode] = useState(false);
  const [resolvedRecipeId, setResolvedRecipeId] = useState<string | null>(recipeId);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [sectionNotice, setSectionNotice] = useState<SectionNotice | null>(null);
  const imagesRef = useRef<RecipeImageCardItem[]>(images);
  const uploadRequestsRef = useRef<Record<string, XMLHttpRequest>>({});
  const addMoreInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (recipeId) {
      setResolvedRecipeId(recipeId);
    }
  }, [recipeId]);

  useEffect(() => () => {
    Object.values(uploadRequestsRef.current).forEach((request) => request.abort());
  }, []);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  const readyImages = useMemo(
    () => images.filter((item) => item.status === "ready" && (item.largeUrl || item.mediumUrl)),
    [images]
  );
  const hasUploadingItems = images.some((item) => item.status === "uploading");
  const canReorder = images.length > 1 && !hasUploadingItems && !images.some((item) => item.isLocalOnly);

  const ensureRecipeForUpload = React.useCallback(async (): Promise<RecipeImageResult> => {
    if (resolvedRecipeId) {
      return {
        ok: true,
        message: "Рецепт уже готов к загрузке.",
        recipe: { id: resolvedRecipeId } as RecipeDetailDto
      };
    }

    const result = await createRecipeDraftForImageUploadAction(null, draftSeed);
    if (result.ok && result.recipe) {
      setResolvedRecipeId(result.recipe.id);
      onRecipeCreated?.(result.recipe);
    }

    return result;
  }, [draftSeed, onRecipeCreated, resolvedRecipeId]);

  const commitUploadedFile = React.useCallback((params: {
    file: File;
    imageId?: string | null;
    recipeId: string;
    sourceId?: string | null;
  }) => {
    const localItem = createLocalItem({
      file: params.file,
      recipeId: params.recipeId,
      recipeTitle,
      status: "uploading"
    });
    const sourceId = params.sourceId ?? params.imageId ?? localItem.id;
    const nextUploadingItem = params.sourceId
      ? {
        ...localItem,
        id: sourceId,
        isLocalOnly: false
      }
      : localItem;

    setImages((current) => sortItems(
      current.some((item) => item.id === sourceId)
        ? current.map((item) => item.id === sourceId ? nextUploadingItem : item)
        : [...current, nextUploadingItem]
    ));

    return new Promise<void>((resolve) => {
      const xhr = new XMLHttpRequest();
      uploadRequestsRef.current[sourceId] = xhr;
      xhr.open("POST", "/api/recipe-images/upload");
      xhr.onload = () => {
        delete uploadRequestsRef.current[sourceId];
        const response = parseUploadResponse(xhr.responseText);

        if (xhr.status >= 200 && xhr.status < 300 && response.ok && response.image) {
          const uploadedImage = response.image;
          setImages((current) => replaceItem(current, sourceId, {
            ...uploadedImage,
            errorMessage: null,
            localFile: null,
            localPreviewUrl: null,
            progress: 100,
            isLocalOnly: false
          }));
          resolve();
          return;
        }

        const message = resolveUploadFailureMessage(response.message, xhr.status);
        const retryable = xhr.status >= 500;

        if (!params.sourceId && xhr.status === 400 && isCapacityFailureMessage(message)) {
          setImages((current) => current.filter((item) => item.id !== sourceId));
          setSectionNotice({ message: buildCapacityNotice(message) });
          resolve();
          return;
        }

        const failedItem = response.image
          ? {
            ...response.image,
            errorMessage: message,
            localFile: retryable ? params.file : null,
            localPreviewUrl: nextUploadingItem.localPreviewUrl,
            progress: 0,
            canRetry: retryable,
            isLocalOnly: false
          }
          : {
            ...nextUploadingItem,
            status: "failed" as const,
            progress: 0,
            errorMessage: message,
            localFile: retryable ? params.file : null,
            canRetry: retryable
          };

        setImages((current) => replaceItem(current, sourceId, failedItem));
        resolve();
      };

      xhr.onerror = () => {
        delete uploadRequestsRef.current[sourceId];
        setImages((current) => replaceItem(current, sourceId, {
          ...nextUploadingItem,
          status: "failed",
          progress: 0,
          errorMessage: "Не удалось загрузить. Попробуйте ещё раз.",
          canRetry: true
        }));
        resolve();
      };

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) {
          return;
        }

        const progress = Math.min(95, Math.round((event.loaded / event.total) * 100));
        setImages((current) => current.map((item) => item.id === sourceId ? { ...item, progress } : item));
      };

      const formData = new FormData();
      formData.set("recipeId", params.recipeId);
      if (params.imageId) {
        formData.set("imageId", params.imageId);
      }
      formData.set("file", params.file);
      xhr.send(formData);
    });
  }, [recipeTitle]);

  const handleFilesSelected = React.useCallback(async (selectedFiles: File[]) => {
    if (!selectedFiles.length) {
      return;
    }

    const currentImages = imagesRef.current;
    const localRecipeId = resolvedRecipeId ?? recipeId ?? "local";
    let activeCount = getActiveImageCount(currentImages);
    let activeBytes = getActiveImageBytes(currentImages);
    let invalidCount = 0;
    let skippedByCount = 0;
    let skippedByTotalBytes = 0;
    const uploadFiles: File[] = [];
    const localFailures: RecipeImageCardItem[] = [];
    const uploadTasks: Promise<void>[] = [];

    setSectionError(null);
    setSectionNotice(null);

    for (const file of selectedFiles) {
      const immediateError = buildUploadErrorMessage(file);
      if (immediateError) {
        invalidCount += 1;
        localFailures.push(createLocalItem({
          canRetry: false,
          file,
          recipeId: localRecipeId,
          recipeTitle,
          status: "failed",
          message: immediateError
        }));
        continue;
      }

      if (activeCount >= RECIPE_IMAGE_MAX_COUNT) {
        skippedByCount += 1;
        continue;
      }

      if (activeBytes + file.size > RECIPE_IMAGE_MAX_TOTAL_BYTES) {
        skippedByTotalBytes += 1;
        continue;
      }

      activeCount += 1;
      activeBytes += file.size;
      uploadFiles.push(file);
    }

    if (localFailures.length) {
      setImages((current) => sortItems([...current, ...localFailures]));
    }

    const noticeMessage = buildSelectionNotice({
      invalidCount,
      queuedCount: uploadFiles.length,
      skippedByCount,
      skippedByTotalBytes
    });
    if (noticeMessage) {
      setSectionNotice({ message: noticeMessage });
    }

    if (!uploadFiles.length) {
      return;
    }

    const recipeResult = await ensureRecipeForUpload();
    if (!recipeResult.ok || !recipeResult.recipe?.id) {
      setSectionError(recipeResult.message);
      return;
    }

    const targetRecipeId = recipeResult.recipe.id;
    setResolvedRecipeId(targetRecipeId);

    for (const file of uploadFiles) {
      uploadTasks.push(commitUploadedFile({
        file,
        recipeId: targetRecipeId
      }));
    }

    await Promise.all(uploadTasks);
  }, [commitUploadedFile, ensureRecipeForUpload, recipeId, recipeTitle, resolvedRecipeId]);

  const handleDelete = React.useCallback(async (item: RecipeImageCardItem) => {
    setSectionError(null);
    setSectionNotice(null);
    if (item.isLocalOnly) {
      setImages((current) => current.filter((candidate) => candidate.id !== item.id));
      return;
    }

    const result = await deleteRecipeImageAction(item.id);
    if (!result.ok) {
      setSectionError(result.message);
      return;
    }

    setImages((current) => current.filter((candidate) => candidate.id !== item.id));
  }, []);

  const handleSetCover = React.useCallback(async (item: RecipeImageCardItem) => {
    if (item.status !== "ready") {
      return;
    }

    setSectionError(null);
    const result = await setRecipeCoverImageAction(item.id);

    if (!result.ok || !result.image) {
      setSectionError(result.message);
      return;
    }

    setImages((current) => current.map((candidate) => ({
      ...candidate,
      isCover: candidate.id === result.image?.id
    })));
  }, []);

  const handleRetry = React.useCallback(async (item: RecipeImageCardItem) => {
    if (!item.localFile || item.canRetry === false) {
      return;
    }

    setSectionError(null);
    setSectionNotice(null);

    const recipeResult = await ensureRecipeForUpload();
    if (!recipeResult.ok || !recipeResult.recipe?.id) {
      setSectionError(recipeResult.message);
      return;
    }

    await commitUploadedFile({
      file: item.localFile,
      recipeId: recipeResult.recipe.id,
      imageId: item.isLocalOnly ? null : item.id,
      sourceId: item.id
    });
  }, [commitUploadedFile, ensureRecipeForUpload]);

  const handleReorder = React.useCallback(async (orderedIds: string[]) => {
    if (!resolvedRecipeId) {
      return;
    }

    setSectionError(null);
    const previous = images;
    setReorderMode(false);
    setImages((current) => sortItems(current.map((item) => ({
      ...item,
      sortOrder: orderedIds.indexOf(item.id)
    }))));

    const result = await reorderRecipeImagesAction(resolvedRecipeId, orderedIds);
    if (!result.ok || !result.images) {
      setImages(previous);
      setSectionError(result.message);
      return;
    }

    setImages(sortItems(result.images));
  }, [images, resolvedRecipeId]);

  return (
    <details className="group rounded-2xl border border-border bg-card p-5 shadow-sm" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-foreground">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-muted">
          <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
        </div>
        Фото пива
      </summary>

      <div className="mt-4 space-y-4">
        {!images.length ? (
          <RecipeImageUploader
            empty
            label="Загрузить фото"
            onFilesSelected={(files) => void handleFilesSelected(files)}
          />
        ) : (
          <>
            <input
              ref={addMoreInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files?.length) {
                  void handleFilesSelected(Array.from(event.target.files));
                  if (addMoreInputRef.current) {
                    addMoreInputRef.current.value = "";
                  }
                }
              }}
            />

            <RecipeImageGrid
              items={images}
              reorderMode={reorderMode}
              onAddMore={getActiveImageCount(images) < RECIPE_IMAGE_MAX_COUNT ? () => addMoreInputRef.current?.click() : undefined}
              onDelete={(item) => void handleDelete(item)}
              onOpen={(item) => {
                const index = readyImages.findIndex((candidate) => candidate.id === item.id);
                if (index >= 0) {
                  setLightboxIndex(index);
                }
              }}
              onRetry={(item) => void handleRetry(item)}
              onSetCover={(item) => void handleSetCover(item)}
              onReorder={(orderedIds) => void handleReorder(orderedIds)}
            />

            {(canReorder || reorderMode) ? (
              <div className="flex justify-end">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  onClick={() => setReorderMode((current) => !current)}
                >
                  <MoveVertical className="h-3.5 w-3.5" />
                  {reorderMode ? "Готово" : "Изменить порядок"}
                </button>
              </div>
            ) : null}
          </>
        )}

        {sectionNotice ? (
          <p className="rounded-xl bg-warning-subtle px-3 py-2 text-sm text-warning-subtle-foreground ring-1 ring-warning/30">
            {sectionNotice.message}
          </p>
        ) : null}

        {sectionError ? <p className="text-sm text-destructive">{sectionError}</p> : null}
      </div>

      <RecipeImageLightbox
        items={readyImages}
        openIndex={lightboxIndex}
        onClose={() => setLightboxIndex(-1)}
      />
    </details>
  );
}
