"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { addCustomIngredientAction, addSelectedIngredientAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import type {
  IngredientCategory,
  IngredientSuggestionItem,
  IngredientSubtype
} from "@/features/ingredients/contracts";
import type { SystemCurrency } from "@/features/system/currency";

import { CatalogIngredientForm } from "./catalog-ingredient-form";
import { CustomIngredientPanel } from "./custom-ingredient-panel";
import {
  InventoryIngredientCategoryGrid,
  resolveInventoryIngredientCategoryValue,
  resolveInventoryIngredientContextFromCategoryValue,
  type InventoryIngredientCategoryValue
} from "./inventory-ingredient-category-grid";
import {
  InventoryIngredientContextSummary,
  resolveInventoryIngredientContextSummaryFromSuggestion
} from "./inventory-ingredient-context-summary";

type Props = {
  open: boolean;
  onClose: () => void;
  preferredCurrency?: SystemCurrency;
  initialSelection?: IngredientSuggestionItem | null;
  initialCategory?: IngredientCategory | null;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
};

type Mode = "catalog" | "custom";
const addIngredientLastCategoryStorageKey = "nb:add-ingredient:last-category";

type AddIngredientSuccessEffects = {
  onClose: () => void;
  refresh: () => void;
};

const appendPayloadToFormData = (formData: FormData, payload: Record<string, unknown>) => {
  Object.entries(payload).forEach(([key, value]) => {
    if (value == null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((entry) => {
        if (entry != null) {
          formData.append(key, String(entry));
        }
      });
      return;
    }

    formData.set(key, String(value));
  });
};

export const applyAddIngredientSuccessEffects = (
  result: AddIngredientResult,
  { onClose, refresh }: AddIngredientSuccessEffects
) => {
  if (!result.ok) {
    return;
  }

  onClose();
  refresh();
};

export const shouldCloseAddIngredientModalFromBackdropInteraction = ({
  pointerDownStartedOnBackdrop,
  clickFinishedOnBackdrop
}: {
  pointerDownStartedOnBackdrop: boolean;
  clickFinishedOnBackdrop: boolean;
}) => pointerDownStartedOnBackdrop && clickFinishedOnBackdrop;

export const applyAddIngredientImmediateControlAction = ({
  event,
  action
}: {
  event: Pick<React.PointerEvent<HTMLButtonElement>, "preventDefault">;
  action: () => void;
}) => {
  event.preventDefault();
  action();
};

export const shouldApplyAddIngredientControlActionOnClick = ({
  detail
}: {
  detail: number;
}) => detail === 0;

const normalizeAddIngredientCategoryValue = (
  value: string | null | undefined
): InventoryIngredientCategoryValue | null => (
  value === "malt"
    || value === "fermentable"
    || value === "hop"
    || value === "yeast"
    || value === "water_treatment"
    || value === "consumable"
    ? value
    : null
);

const readStoredAddIngredientCategoryValue = (): InventoryIngredientCategoryValue | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return normalizeAddIngredientCategoryValue(window.localStorage.getItem(addIngredientLastCategoryStorageKey));
  } catch {
    return null;
  }
};

const persistAddIngredientCategoryValue = (value: InventoryIngredientCategoryValue) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(addIngredientLastCategoryStorageKey, value);
  } catch {
    // Ignore storage failures; the modal can still work with in-memory state.
  }
};

export const resolveAddIngredientStartCategoryValue = ({
  initialSelection,
  initialCategory,
  initialSubtype,
  rememberedCategoryValue
}: {
  initialSelection?: IngredientSuggestionItem | null;
  initialCategory?: IngredientCategory | null;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  rememberedCategoryValue?: InventoryIngredientCategoryValue | null;
}): InventoryIngredientCategoryValue => {
  if (initialSelection?.category === "fermentable" && (initialSelection.subtype === "malt" || initialSelection.subtype === "fermentable")) {
    return initialSelection.subtype;
  }

  if (initialSelection?.category) {
    return initialSelection.category;
  }

  if (initialCategory === "fermentable" && (initialSubtype === "malt" || initialSubtype === "fermentable")) {
    return initialSubtype;
  }

  if (initialCategory) {
    return initialCategory;
  }

  return rememberedCategoryValue ?? "malt";
};

export const resolveAddIngredientStartContext = ({
  initialSelection,
  initialCategory,
  initialSubtype,
  rememberedCategoryValue
}: {
  initialSelection?: IngredientSuggestionItem | null;
  initialCategory?: IngredientCategory | null;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  rememberedCategoryValue?: InventoryIngredientCategoryValue | null;
}) => {
  const categoryValue = resolveAddIngredientStartCategoryValue({
    initialSelection,
    initialCategory,
    initialSubtype,
    rememberedCategoryValue
  });
  const { category, subtype } = resolveInventoryIngredientContextFromCategoryValue(categoryValue);

  return {
    categoryValue,
    category,
    subtype
  };
};

export function AddIngredientModal({
  open,
  onClose,
  preferredCurrency = "RUB",
  initialSelection = null,
  initialCategory = null,
  initialSubtype = null
}: Props) {
  const router = useRouter();
  const [catalogCategory, setCatalogCategory] = useState<IngredientCategory | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).category);
  const [catalogSubtype, setCatalogSubtype] = useState<Extract<IngredientSubtype, "malt" | "fermentable"> | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).subtype);
  const [customCategory, setCustomCategory] = useState<IngredientCategory | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).category);
  const [customSubtype, setCustomSubtype] = useState<Extract<IngredientSubtype, "malt" | "fermentable"> | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).subtype);
  const [mode, setMode] = useState<Mode>("catalog");
  const [result, setResult] = useState<AddIngredientResult | null>(null);
  const [pending, setPending] = useState(false);
  const [selectedIngredient, setSelectedIngredient] = useState<IngredientSuggestionItem | null>(initialSelection);
  const backdropPointerDownStartedRef = useRef(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    const startContext = resolveAddIngredientStartContext({
      initialSelection,
      initialCategory,
      initialSubtype,
      rememberedCategoryValue: readStoredAddIngredientCategoryValue()
    });

    setCatalogCategory(startContext.category);
    setCatalogSubtype(startContext.subtype);
    setCustomCategory(startContext.category);
    setCustomSubtype(startContext.subtype);
    setMode("catalog");
    setSelectedIngredient(initialSelection);
    setResult(null);
    setPending(false);
  }, [initialCategory, initialSelection, initialSubtype, open]);

  if (!open) {
    return null;
  }

  const selectedCategoryValue: InventoryIngredientCategoryValue | null = mode === "catalog"
    ? resolveInventoryIngredientCategoryValue({ category: catalogCategory, subtype: catalogSubtype })
    : resolveInventoryIngredientCategoryValue({ category: customCategory, subtype: customSubtype });

  const handleCategoryChange = (nextCategory: InventoryIngredientCategoryValue) => {
    const { category: nextResolvedCategory, subtype: nextResolvedSubtype } = resolveInventoryIngredientContextFromCategoryValue(nextCategory);
    persistAddIngredientCategoryValue(nextCategory);

    if (mode === "catalog") {
      setCatalogCategory(nextResolvedCategory);
      setCatalogSubtype(nextResolvedSubtype);
      setCustomCategory(nextResolvedCategory);
      setCustomSubtype(nextResolvedSubtype);
      return;
    }

    setCustomCategory(nextResolvedCategory);
    setCustomSubtype(nextResolvedSubtype);
    setCatalogCategory(nextResolvedCategory);
    setCatalogSubtype(nextResolvedSubtype);
  };

  const handleSuccess = (nextResult: AddIngredientResult) => {
    setResult(nextResult);
    if (nextResult.ok && selectedCategoryValue) {
      persistAddIngredientCategoryValue(selectedCategoryValue);
    }
    applyAddIngredientSuccessEffects(nextResult, {
      onClose,
      refresh: () => router.refresh()
    });
  };

  const showSelectionStageChrome = !selectedIngredient;
  const selectedIngredientContextSummary = selectedIngredient
    ? resolveInventoryIngredientContextSummaryFromSuggestion(selectedIngredient)
    : null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-zinc-950/55 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Добавить ингредиент"
      onPointerDown={(event) => {
        backdropPointerDownStartedRef.current = event.target === event.currentTarget;
      }}
      onClick={(event) => {
        if (shouldCloseAddIngredientModalFromBackdropInteraction({
          pointerDownStartedOnBackdrop: backdropPointerDownStartedRef.current,
          clickFinishedOnBackdrop: event.target === event.currentTarget
        })) {
          onClose();
        }

        backdropPointerDownStartedRef.current = false;
      }}
    >
      <div className="relative z-[101] max-h-[92vh] w-full overflow-y-auto rounded-t-xl bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-xl" data-testid="add-ingredient-modal">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-950">Добавить ингредиент</h2>
          <button type="button" className="text-sm text-zinc-500 transition-colors hover:text-zinc-700" onClick={onClose}>Закрыть</button>
        </div>

        <div className="space-y-4">
          {showSelectionStageChrome ? (
            <>
              <InventoryIngredientCategoryGrid
                value={selectedCategoryValue}
                onChange={handleCategoryChange}
                testId="add-ingredient-category-grid"
              />

              <div className="grid grid-cols-2 gap-2 rounded-md bg-zinc-100 p-1 text-sm" data-testid="add-ingredient-mode-switch">
                <button
                  type="button"
                  onPointerDown={(event) => applyAddIngredientImmediateControlAction({
                    event,
                    action: () => setMode("catalog")
                  })}
                  onClick={(event) => {
                    if (!shouldApplyAddIngredientControlActionOnClick({ detail: event.detail })) {
                      return;
                    }

                    setMode("catalog");
                  }}
                  className={`rounded px-3 py-2 ${mode === "catalog" ? "bg-white shadow" : ""}`}
                >
                  Из каталога
                </button>
                <button
                  type="button"
                  onPointerDown={(event) => applyAddIngredientImmediateControlAction({
                    event,
                    action: () => setMode("custom")
                  })}
                  onClick={(event) => {
                    if (!shouldApplyAddIngredientControlActionOnClick({ detail: event.detail })) {
                      return;
                    }

                    setMode("custom");
                  }}
                  className={`rounded px-3 py-2 ${mode === "custom" ? "bg-white shadow" : ""}`}
                >
                  Добавить свой
                </button>
              </div>
            </>
          ) : null}

          {result && <p className={`text-sm ${result.ok ? "text-green-700" : "text-red-600"}`}>{result.message}</p>}

          {selectedIngredientContextSummary ? (
            <InventoryIngredientContextSummary
              summary={selectedIngredientContextSummary}
              testId="add-ingredient-context-summary"
            />
          ) : null}

          <div>
            {mode === "catalog" && catalogCategory ? (
              <CatalogIngredientForm
                category={catalogCategory}
                subtype={catalogSubtype}
                preferredCurrency={preferredCurrency}
                pending={pending}
                autoFocus
                initialSelection={initialSelection}
                fieldErrors={result?.fieldErrors}
                selectionActionLabel="Изменить выбор"
                onSelectedIngredientChange={setSelectedIngredient}
                onRequestCustom={() => {
                  setSelectedIngredient(null);
                  setMode("custom");
                }}
                onSubmit={async (payload) => {
                  setPending(true);
                  const formData = new FormData();
                  appendPayloadToFormData(formData, payload);
                  const nextResult = await addSelectedIngredientAction(null, formData);
                  setPending(false);
                  handleSuccess(nextResult);
                }}
              />
            ) : null}

            {mode === "custom" && customCategory ? (
              <CustomIngredientPanel
                category={customCategory}
                initialSubtype={customSubtype}
                preferredCurrency={preferredCurrency}
                pending={pending}
                fieldErrors={result?.fieldErrors}
                onSubmitCreate={async (payload) => {
                  setPending(true);
                  const formData = new FormData();
                  appendPayloadToFormData(formData, payload);
                  const nextResult = await addCustomIngredientAction(null, formData);
                  setPending(false);
                  handleSuccess(nextResult);
                }}
              />
            ) : null}

            {((mode === "catalog" && !catalogCategory) || (mode === "custom" && !customCategory)) ? (
              <div className="flex h-full min-h-[18rem] items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 px-4 text-center text-sm text-zinc-500">
                Выберите категорию, и после этого появится {mode === "catalog" ? "поиск" : "форма создания своего ингредиента"}.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (typeof window === "undefined") {
    return modalContent;
  }

  if (!mounted) {
    return null;
  }

  return createPortal(modalContent, document.body);
}
