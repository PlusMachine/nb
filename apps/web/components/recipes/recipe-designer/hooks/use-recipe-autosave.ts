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
  isRecipeDraftWorthPersisting,
  normalizeEditorPublicationState,
  normalizeSavePayload,
  replaceRecipeEditorUrl
} from "../helpers";

export type RecipeSaveStatus = "saved" | "saving" | "error" | "draft";

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
  initialStyleId,
  onRecipeCreated,
  onSaveStatusChange,
  payload,
  currentSignature,
  publicationState,
  setPublicationState,
  setSavedPublicationState
}: {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
  initialTitle?: string;
  initialStyleId?: string;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
  onSaveStatusChange?: (status: RecipeSaveStatus) => void;
  payload: RecipeEditorPayload;
  currentSignature: string;
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
  // Рецепт удалён из редактора: гасит автосейв намертво. Без этого уже взведённый
  // 1.5-секундный таймер после удаления сделал бы update по мёртвому id — или,
  // хуже, create и воскресил бы рецепт новой записью.
  const deletedRef = useRef(false);
  const [savedSignature, setSavedSignature] = useState(currentSignature);
  const isDirty = currentSignature !== savedSignature;
  const hasCurrentSaveError = saveResultSignature === currentSignature && Boolean(saveResult && !saveResult.ok);
  const persistMode: "create" | "edit" = activeRecipeId ? "edit" : mode;
  // Чем редактор засеян при открытии: автоимя «Новый рецепт N» и стиль из URL.
  // Порог осмысленности считается ОТНОСИТЕЛЬНО этой базы — своё имя вместо
  // автоматического и свой стиль вместо предзаполненного.
  const draftBaseline = React.useMemo(
    () => ({ title: initialTitle ?? null, styleId: initialStyleId ?? null }),
    [initialStyleId, initialTitle]
  );
  const isDraftWorthPersisting = isRecipeDraftWorthPersisting(payload, draftBaseline);
  // Пустой рецепт в БД не создаём (см. isRecipeDraftWorthPersisting). Статус при этом
  // обязан быть честным: без отдельного "draft" шапка вечно висела бы «Сохранение…».
  const isCreateGated = persistMode === "create" && !isDraftWorthPersisting;
  const saveStatus: RecipeSaveStatus = hasCurrentSaveError
    ? "error"
    : isCreateGated
      ? "draft"
      : (pendingSave || isDirty ? "saving" : "saved");
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
      // Рецепт удаляют — терять уже нечего, спрашивать «уйти со страницы?» незачем.
      // Проверяем ref в момент срабатывания: удаление не меняет стейт и эффект не
      // перерегистрируется.
      if (deletedRef.current) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty, pendingSave]);

  const persistRecipe = React.useCallback(async ({
    nextPublicationState = publicationState,
    surfaceInlineResult = true,
    // Явное действие пользователя (публикация, экспорт, «Сварить», новая версия)
    // обязано сохранить рецепт даже до порога осмысленности — иначе кнопка молча
    // ничего не сделает. Гейт остаётся только на фоновом автосейве.
    force = false
  }: {
    nextPublicationState?: RecipePublicationState;
    surfaceInlineResult?: boolean;
    force?: boolean;
  } = {}) => {
    if (pendingSaveRef.current || deletedRef.current) {
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

    // Пока рецепт не набрал ни содержания, ни имени — записи в БД не заводим (B2).
    // Не ошибка: фоновый автосейв молчит, а шапка показывает «Не сохранён» и кнопку
    // «Сохранить» — она приходит сюда с force и создаёт запись по явному решению.
    if (persistMode === "create" && !force && !isRecipeDraftWorthPersisting(nextPayload, draftBaseline)) {
      return null;
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
  }, [activeRecipeId, draftBaseline, initialRecipe, initialTitle, onRecipeCreated, payload, persistMode, publicationState, setPublicationState, setSavedPublicationState]);

  useEffect(() => {
    if (!isDirty || deletedRef.current) return;
    if (blockedSignature === currentSignature) return;
    let cancelled = false;
    const autoSaveTimer = window.setTimeout(async () => {
      if (cancelled || pendingSaveRef.current || deletedRef.current) return;
      await persistRecipe();
    }, 1500);
    return () => { cancelled = true; window.clearTimeout(autoSaveTimer); };
  }, [blockedSignature, currentSignature, isDirty, persistRecipe]);

  // Рецепт удаляется: гасим автосейв ДО запроса (пока идёт delete, взведённый
  // таймер не должен успеть сохранить рецепт обратно).
  const markDeleted = React.useCallback(() => {
    deletedRef.current = true;
  }, []);

  // Удаление не прошло (сеть/сервер) — редактор обязан снова сохранять, иначе
  // все дальнейшие правки уходили бы в никуда.
  const restoreAfterFailedDelete = React.useCallback(() => {
    deletedRef.current = false;
  }, []);

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
    isDirty,
    isDraftWorthPersisting,
    saveStatus,
    visibleSaveResult,
    hasRetriableSaveError,
    persistRecipe,
    markDeleted,
    restoreAfterFailedDelete
  };
}
