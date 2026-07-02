"use client";

import React, { useEffect, useRef, useState } from "react";

import {
  createRecipeAction,
  updateRecipeAction,
  type RecipeEditorPayload,
  type RecipeEditorResult
} from "@/app/(app)/app/recipes/actions";
import type { RecipeDetailDto, RecipePublicationState } from "@/features/recipes/contracts";

import {
  buildAutosaveBlockedResult,
  getBatchVolumeLiters,
  normalizeEditorPublicationState,
  normalizeSavePayload,
  replaceRecipeEditorUrl
} from "../helpers";

export type RecipeSaveStatus = "saved" | "saving" | "error";

// Автосейв: persistRecipe (create/update, дедупликация field-error блокировкой,
// ретраибельные сетевые сбои), pendingSave/saveResult/isDirty/beforeunload, и
// «личность» рецепта (activeRecipeId/slug/версия), которую персист-цикл же и
// проставляет по факту успешного сохранения — это одна и та же зона состояния.
// Обработчики версий/варки/импорта/экспорта остаются в recipe-designer.tsx —
// они вызывают persistRecipe как строительный блок поверх нескольких доменов.
export function useRecipeAutosave({
  mode,
  initialRecipe,
  initialTitle,
  onRecipeCreated,
  onSaveStatusChange,
  payload,
  currentSignature,
  batchVolumeL,
  publicationState,
  setPublicationState,
  setSavedPublicationState
}: {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
  initialTitle?: string;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
  onSaveStatusChange?: (status: RecipeSaveStatus) => void;
  payload: RecipeEditorPayload;
  currentSignature: string;
  batchVolumeL: number | null;
  publicationState: RecipePublicationState;
  setPublicationState: (state: RecipePublicationState) => void;
  setSavedPublicationState: (state: RecipePublicationState) => void;
}) {
  const [activeRecipeId, setActiveRecipeId] = useState(initialRecipe?.id ?? null);
  const [activeRecipeSlug, setActiveRecipeSlug] = useState(initialRecipe?.slug ?? null);
  const [activeVersionNumber, setActiveVersionNumber] = useState(initialRecipe?.versionNumber ?? 1);
  const [recipeVersions, setRecipeVersions] = useState(initialRecipe?.versions ?? []);
  const [saveResult, setSaveResult] = useState<RecipeEditorResult | null>(null);
  const [pendingSave, setPendingSave] = useState(false);
  const [blockedSignature, setBlockedSignature] = useState<string | null>(null);
  const [saveResultSignature, setSaveResultSignature] = useState<string | null>(null);
  const pendingSaveRef = useRef(false);
  const [savedSignature, setSavedSignature] = useState(currentSignature);
  // Объём партии на момент последнего сохранения — база для инлайн-действия
  // «Пересчитать под объём» (#6): показываем его только когда текущий объём
  // разошёлся с уже сохранённым, а не с тем, что было при открытии страницы.
  const [savedBatchVolumeL, setSavedBatchVolumeL] = useState<number | null>(batchVolumeL);
  const isDirty = currentSignature !== savedSignature;
  const hasCurrentSaveError = saveResultSignature === currentSignature && Boolean(saveResult && !saveResult.ok);
  const saveStatus: RecipeSaveStatus = hasCurrentSaveError ? "error" : (pendingSave || isDirty ? "saving" : "saved");
  const persistMode: "create" | "edit" = activeRecipeId ? "edit" : mode;
  const visibleSaveResult = saveResultSignature === currentSignature ? saveResult : null;
  const hasRetriableSaveError = Boolean(
    visibleSaveResult
    && !visibleSaveResult.ok
    && (!visibleSaveResult.fieldErrors || !Object.keys(visibleSaveResult.fieldErrors).length)
  );

  useEffect(() => {
    onSaveStatusChange?.(saveStatus);
  }, [onSaveStatusChange, saveStatus]);

  useEffect(() => {
    pendingSaveRef.current = pendingSave;
  }, [pendingSave]);

  useEffect(() => {
    if (typeof window === "undefined" || (!isDirty && !pendingSave)) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, pendingSave]);

  const persistRecipe = React.useCallback(async ({
    nextPublicationState = publicationState,
    surfaceInlineResult = true
  }: {
    nextPublicationState?: RecipePublicationState;
    surfaceInlineResult?: boolean;
  } = {}) => {
    if (pendingSaveRef.current) {
      return null;
    }

    const trimmedTitle = payload.title.trim();
    const draftFallbackTitle = initialTitle?.trim() || initialRecipe?.title?.trim() || "Новый рецепт";
    // Приватный черновик не должен морозить весь автосейв из-за пустого названия:
    // подставляем дефолтное имя для сохранения, жёсткую проверку оставляем публикации (#13).
    const effectiveTitle = !trimmedTitle && nextPublicationState !== "published"
      ? draftFallbackTitle
      : payload.title;
    const nextPayload = normalizeSavePayload({
      ...payload,
      title: effectiveTitle,
      publicationState: nextPublicationState
    });
    const nextSignature = JSON.stringify({
      ...payload,
      publicationState: nextPublicationState
    });
    const nextBlockedSaveResult = buildAutosaveBlockedResult(nextPayload);

    if (nextBlockedSaveResult) {
      setSaveResult(nextBlockedSaveResult);
      setSaveResultSignature(surfaceInlineResult ? nextSignature : null);
      setBlockedSignature(nextSignature);
      return nextBlockedSaveResult;
    }

    setPendingSave(true);
    let result: RecipeEditorResult;
    try {
      result = persistMode === "create"
        ? await createRecipeAction(nextPayload)
        : await updateRecipeAction(activeRecipeId!, nextPayload);
    } catch {
      // Сетевой/серверный сбой: не оставляем pendingSave залипшим (иначе все
      // будущие автосейвы заглушены) и показываем ретраибельную ошибку (P0-1).
      const failure: RecipeEditorResult = {
        ok: false,
        message: "Не удалось сохранить — проверьте соединение и повторите."
      };
      setBlockedSignature(null);
      setSaveResult(failure);
      setSaveResultSignature(surfaceInlineResult ? nextSignature : null);
      return failure;
    } finally {
      setPendingSave(false);
    }

    if (!result.ok && result.fieldErrors && Object.keys(result.fieldErrors).length) {
      setBlockedSignature(nextSignature);
    } else {
      setBlockedSignature(null);
    }

    if (result.ok && result.recipe) {
      const savedRecipe = result.recipe;
      const normalizedState = normalizeEditorPublicationState(savedRecipe.publicationState);
      const completedSignature = JSON.stringify({
        ...payload,
        publicationState: normalizedState
      });

      setPublicationState(normalizedState);
      setSavedPublicationState(normalizedState);
      setSavedSignature(completedSignature);
      setSavedBatchVolumeL(getBatchVolumeLiters(String(savedRecipe.batchSizeEnteredQuantity), savedRecipe.batchSizeEnteredUnit));
      setSaveResult(result);
      setSaveResultSignature(completedSignature);
      setActiveRecipeSlug(savedRecipe.slug);
      setActiveVersionNumber(savedRecipe.versionNumber);
      setRecipeVersions(savedRecipe.versions);

      if (!activeRecipeId) {
        setActiveRecipeId(savedRecipe.id);
        onRecipeCreated?.(savedRecipe);
        replaceRecipeEditorUrl(savedRecipe.id);
      }

      return result;
    }

    setSaveResult(result);
    setSaveResultSignature(surfaceInlineResult ? nextSignature : null);
    return result;
  }, [activeRecipeId, initialRecipe, initialTitle, onRecipeCreated, payload, persistMode, publicationState, setPublicationState, setSavedPublicationState]);

  useEffect(() => {
    if (!isDirty) return;
    if (blockedSignature === currentSignature) return;
    let cancelled = false;
    const autoSaveTimer = window.setTimeout(async () => {
      if (cancelled || pendingSaveRef.current) return;
      await persistRecipe();
    }, 1500);
    return () => { cancelled = true; window.clearTimeout(autoSaveTimer); };
  }, [blockedSignature, currentSignature, isDirty, persistRecipe]);

  return {
    activeRecipeId,
    setActiveRecipeId,
    activeRecipeSlug,
    setActiveRecipeSlug,
    activeVersionNumber,
    setActiveVersionNumber,
    recipeVersions,
    setRecipeVersions,
    saveResult,
    setSaveResult,
    saveResultSignature,
    setSaveResultSignature,
    blockedSignature,
    setBlockedSignature,
    pendingSave,
    setPendingSave,
    savedSignature,
    setSavedSignature,
    savedBatchVolumeL,
    setSavedBatchVolumeL,
    isDirty,
    saveStatus,
    visibleSaveResult,
    hasRetriableSaveError,
    persistRecipe
  };
}
