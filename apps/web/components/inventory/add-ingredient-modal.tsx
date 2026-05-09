"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { addCustomIngredientAction, addSelectedIngredientAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import type {
  IngredientCategory,
  IngredientPickerQuickStartResultByContext,
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
  initialGroup?: string | null;
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
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
  value === "fermentable"
    || value === "hop"
    || value === "yeast"
    || value === "water_treatment"
    || value === "consumable_supply"
    || value === "consumable_additive"
    ? value
    : value === "malt"
      ? "fermentable"
      : value === "consumable"
        ? "consumable_additive"
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

const resolveAddIngredientStartFermentableSubtype = ({
  initialSelection,
  initialCategory,
  initialSubtype
}: {
  initialSelection?: IngredientSuggestionItem | null;
  initialCategory?: IngredientCategory | null;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
}) => {
  if (
    initialSelection?.category === "fermentable"
    && (initialSelection.subtype === "malt" || initialSelection.subtype === "fermentable")
  ) {
    return initialSelection.subtype;
  }

  if (
    initialCategory === "fermentable"
    && (initialSubtype === "malt" || initialSubtype === "fermentable")
  ) {
    return initialSubtype;
  }

  if (
    initialSelection?.category === "fermentable"
    || initialCategory === "fermentable"
    || (!initialSelection && !initialCategory)
  ) {
    return "malt";
  }

  return null;
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
  initialGroup,
  rememberedCategoryValue
}: {
  initialSelection?: IngredientSuggestionItem | null;
  initialCategory?: IngredientCategory | null;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  initialGroup?: string | null;
  rememberedCategoryValue?: InventoryIngredientCategoryValue | null;
}): InventoryIngredientCategoryValue => {
  if (initialSelection?.category) {
    return resolveInventoryIngredientCategoryValue({
      category: initialSelection.category,
      subtype: initialSelection.subtype ?? null,
      technicalData: initialSelection.technicalData ?? null,
      groupName: initialSelection.groupName ?? null,
      itemKind: initialSelection.itemKind ?? null
    }) ?? "fermentable";
  }

  if (initialCategory) {
    return resolveInventoryIngredientCategoryValue({
      category: initialCategory,
      subtype: initialSubtype ?? null,
      group: initialGroup ?? null
    }) ?? "fermentable";
  }

  return rememberedCategoryValue ?? "fermentable";
};

export const resolveAddIngredientStartContext = ({
  initialSelection,
  initialCategory,
  initialSubtype,
  initialGroup,
  rememberedCategoryValue
}: {
  initialSelection?: IngredientSuggestionItem | null;
  initialCategory?: IngredientCategory | null;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  initialGroup?: string | null;
  rememberedCategoryValue?: InventoryIngredientCategoryValue | null;
}) => {
  const categoryValue = resolveAddIngredientStartCategoryValue({
    initialSelection,
    initialCategory,
    initialSubtype,
    initialGroup,
    rememberedCategoryValue
  });
  const { category, subtype, group } = resolveInventoryIngredientContextFromCategoryValue(categoryValue);
  const fermentableSubtype = categoryValue === "fermentable"
    ? resolveAddIngredientStartFermentableSubtype({
      initialSelection,
      initialCategory,
      initialSubtype
    }) ?? subtype
    : subtype;
  const resolvedGroup = typeof initialGroup === "string" && initialGroup.trim().length > 0
    ? initialGroup.trim()
    : categoryValue === "fermentable" && initialSelection?.category === "fermentable"
      ? (initialSelection.groupName ?? group)
      : group;

  return {
    categoryValue,
    category,
    subtype: fermentableSubtype,
    group: resolvedGroup
  };
};

export function AddIngredientModal({
  open,
  onClose,
  preferredCurrency = "RUB",
  initialSelection = null,
  initialCategory = null,
  initialSubtype = null,
  initialGroup = null,
  initialQuickStartDataByContext = null
}: Props) {
  const router = useRouter();
  const [catalogCategory, setCatalogCategory] = useState<IngredientCategory | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    initialGroup,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).category);
  const [catalogSubtype, setCatalogSubtype] = useState<Extract<IngredientSubtype, "malt" | "fermentable"> | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    initialGroup,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).subtype);
  const [catalogGroup, setCatalogGroup] = useState<string | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    initialGroup,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).group);
  const [customCategory, setCustomCategory] = useState<IngredientCategory | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    initialGroup,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).category);
  const [customSubtype, setCustomSubtype] = useState<IngredientSubtype | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    initialGroup,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).subtype);
  const [customGroup, setCustomGroup] = useState<string | null>(() => resolveAddIngredientStartContext({
    initialSelection,
    initialCategory,
    initialSubtype,
    initialGroup,
    rememberedCategoryValue: readStoredAddIngredientCategoryValue()
  }).group);
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

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    const startContext = resolveAddIngredientStartContext({
      initialSelection,
      initialCategory,
      initialSubtype,
      initialGroup,
      rememberedCategoryValue: readStoredAddIngredientCategoryValue()
    });

    setCatalogCategory(startContext.category);
    setCatalogSubtype(startContext.subtype);
    setCatalogGroup(startContext.group);
    setCustomCategory(startContext.category);
    setCustomSubtype(startContext.subtype);
    setCustomGroup(startContext.group);
    setMode("catalog");
    setSelectedIngredient(initialSelection);
    setResult(null);
    setPending(false);
  }, [initialCategory, initialGroup, initialSelection, initialSubtype, open]);

  if (!open) {
    return null;
  }

  const selectedCategoryValue: InventoryIngredientCategoryValue | null = mode === "catalog"
    ? resolveInventoryIngredientCategoryValue({ category: catalogCategory, subtype: catalogSubtype, group: catalogGroup })
    : resolveInventoryIngredientCategoryValue({ category: customCategory, subtype: customSubtype, group: customGroup });
  const initialQuickStartData = catalogCategory === "hop"
    ? (initialQuickStartDataByContext?.hop ?? null)
    : catalogCategory === "yeast"
      ? (initialQuickStartDataByContext?.yeast ?? null)
    : catalogCategory === "water_treatment"
      ? (initialQuickStartDataByContext?.water_treatment ?? null)
    : catalogCategory === "consumable"
      ? (initialQuickStartDataByContext?.consumable ?? null)
    : catalogCategory === "fermentable"
      && (catalogSubtype === "malt" || catalogSubtype === "fermentable")
      ? (initialQuickStartDataByContext?.[catalogSubtype] ?? null)
      : null;

  const handleCategoryChange = (nextCategory: InventoryIngredientCategoryValue) => {
    const {
      category: nextResolvedCategory,
      subtype: nextResolvedSubtype,
      group: nextResolvedGroup
    } = resolveInventoryIngredientContextFromCategoryValue(nextCategory);
    persistAddIngredientCategoryValue(nextCategory);
    const nextCustomSubtype = nextCategory === "consumable_supply"
      ? "sanitizer"
      : nextCategory === "consumable_additive"
        ? "technical_additives"
        : nextResolvedSubtype;

    if (mode === "catalog") {
      setCatalogCategory(nextResolvedCategory);
      setCatalogSubtype(nextResolvedSubtype);
      setCatalogGroup(nextResolvedGroup);
      setCustomCategory(nextResolvedCategory);
      setCustomSubtype(nextCustomSubtype);
      setCustomGroup(nextResolvedGroup);
      return;
    }

    setCustomCategory(nextResolvedCategory);
    setCustomSubtype(nextCustomSubtype);
    setCustomGroup(nextResolvedGroup);
    setCatalogCategory(nextResolvedCategory);
    setCatalogSubtype(nextResolvedSubtype);
    setCatalogGroup(nextResolvedGroup);
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
      className="animate-modal-backdrop fixed inset-0 z-[100] flex items-end justify-center bg-zinc-950/50 backdrop-blur-[2px] sm:items-center sm:p-4"
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
      <div className="animate-modal-content relative z-[101] max-h-[94vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl ring-1 ring-black/[0.06] sm:max-w-2xl sm:rounded-2xl" data-testid="add-ingredient-modal">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-100 bg-white/95 px-5 py-4 backdrop-blur-sm sm:rounded-t-2xl">
          <h2 className="text-base font-semibold text-zinc-900">Добавить ингредиент</h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
            aria-label="Закрыть"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div className="p-5">

        <div className="space-y-4">
          {showSelectionStageChrome ? (
            <>
              <InventoryIngredientCategoryGrid
                value={selectedCategoryValue}
                onChange={handleCategoryChange}
                testId="add-ingredient-category-grid"
              />

              <div className="grid grid-cols-2 gap-1 rounded-xl bg-zinc-100 p-1 text-sm" data-testid="add-ingredient-mode-switch">
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
                  className={`rounded-lg px-3 py-2 font-medium transition-all duration-150 ${mode === "catalog" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
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
                  className={`rounded-lg px-3 py-2 font-medium transition-all duration-150 ${mode === "custom" ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"}`}
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
                initialQuickStartData={initialQuickStartData}
                forcedGroup={catalogGroup}
                preferredCurrency={preferredCurrency}
                pending={pending}
                autoFocus
                initialSelection={initialSelection}
                fieldErrors={result?.fieldErrors}
                selectionActionLabel="Изменить выбор"
                onSubtypeChange={setCatalogSubtype}
                onGroupChange={setCatalogGroup}
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
