"use client";

import { useEffect, useState } from "react";

import type { RecipeDetailDto, RecipePublicationState } from "@/features/recipes/contracts";

import { normalizeEditorPublicationState } from "../helpers";

// Публикация: текущий/сохранённый publicationState, диалоги подтверждения
// публикации и перевода в приватные, чек-лист готовности. Асинхронная
// оркестрация (handlePublishClick/Confirm, handleMakePrivateConfirm) остаётся
// в recipe-designer.tsx — она вызывает persistRecipe из автосейва и читает
// isPublishReady, посчитанный из ingredients/title/styleId в теле компонента.
export function useRecipePublicationState({
  initialRecipe,
  onPublicationStateChange
}: {
  initialRecipe?: RecipeDetailDto;
  onPublicationStateChange?: (state: RecipePublicationState) => void;
}) {
  const initialPublicationState = normalizeEditorPublicationState(initialRecipe?.publicationState);
  const [publicationState, setPublicationState] = useState<RecipePublicationState>(initialPublicationState);
  const [savedPublicationState, setSavedPublicationState] = useState<RecipePublicationState>(initialPublicationState);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [makePrivateConfirmOpen, setMakePrivateConfirmOpen] = useState(false);
  const [makePrivateError, setMakePrivateError] = useState<string | null>(null);
  const [readinessDialogOpen, setReadinessDialogOpen] = useState(false);

  useEffect(() => {
    onPublicationStateChange?.(savedPublicationState);
  }, [onPublicationStateChange, savedPublicationState]);

  return {
    publicationState,
    setPublicationState,
    savedPublicationState,
    setSavedPublicationState,
    publishConfirmOpen,
    setPublishConfirmOpen,
    publishError,
    setPublishError,
    makePrivateConfirmOpen,
    setMakePrivateConfirmOpen,
    makePrivateError,
    setMakePrivateError,
    readinessDialogOpen,
    setReadinessDialogOpen
  };
}
