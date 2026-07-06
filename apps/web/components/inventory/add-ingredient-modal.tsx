"use client";

import React from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogCloseButton, DialogHeader } from "@nb/ui";

import { addCustomIngredientAction, addSelectedIngredientAction, type AddIngredientResult } from "@/app/(app)/app/ingredients/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
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
  /** Дефицит из списка покупок (UX-находка #20): предзаполнить количество/единицу. */
  initialQuantity?: string | null;
  initialUnit?: string | null;
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

type BodyProps = {
  preferredCurrency?: SystemCurrency;
  initialSelection?: IngredientSuggestionItem | null;
  initialCategory?: IngredientCategory | null;
  initialSubtype?: Extract<IngredientSubtype, "malt" | "fermentable"> | null;
  initialGroup?: string | null;
  initialQuantity?: string | null;
  initialUnit?: string | null;
  initialQuickStartDataByContext?: IngredientPickerQuickStartResultByContext | null;
  onClose: () => void;
  /** Не сохранённые данные — для guard'а Dialog-обёртки (закрыть без подтверждения?). */
  onDirtyChange?: (dirty: boolean) => void;
};

/**
 * Содержимое add-ingredient флоу: сетка категорий, переключатель каталог/свой,
 * форма выбора/создания ингредиента. Вынесено из {@link AddIngredientModal}, чтобы
 * тестироваться напрямую через renderToStaticMarkup — Radix Dialog Portal рендерится
 * только на клиенте после монтирования и недоступен в SSR-рендере тестов.
 */
export function AddIngredientModalBody({
  preferredCurrency = "RUB",
  initialSelection = null,
  initialCategory = null,
  initialSubtype = null,
  initialGroup = null,
  initialQuantity = null,
  initialUnit = null,
  initialQuickStartDataByContext = null,
  onClose,
  onDirtyChange
}: BodyProps) {
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
  const [catalogFormDirty, setCatalogFormDirty] = useState(false);
  const [customFormDirty, setCustomFormDirty] = useState(false);

  useEffect(() => {
    onDirtyChange?.(mode === "catalog" ? catalogFormDirty : customFormDirty);
  }, [onDirtyChange, mode, catalogFormDirty, customFormDirty]);

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

  return (
    <div className="space-y-4" data-testid="add-ingredient-modal">
      {showSelectionStageChrome ? (
        <>
          <InventoryIngredientCategoryGrid
            value={selectedCategoryValue}
            onChange={handleCategoryChange}
            testId="add-ingredient-category-grid"
          />

          <div className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1 text-sm" data-testid="add-ingredient-mode-switch">
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
              className={`rounded-lg px-3 py-2 font-medium transition-all duration-150 ${mode === "catalog" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
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
              className={`rounded-lg px-3 py-2 font-medium transition-all duration-150 ${mode === "custom" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              Добавить свой
            </button>
          </div>
        </>
      ) : null}

      {result && (
        <p role={result.ok ? "status" : "alert"} className={`text-sm ${result.ok ? "text-success" : "text-destructive"}`}>
          {result.message}
        </p>
      )}

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
            initialQuantity={initialQuantity}
            initialUnit={initialUnit}
            fieldErrors={result?.fieldErrors}
            selectionActionLabel="Изменить выбор"
            onSubtypeChange={(next) => {
              setCatalogSubtype(next);
              setCustomSubtype(next);
            }}
            onGroupChange={(next) => {
              setCatalogGroup(next);
              setCustomGroup(next);
            }}
            onSelectedIngredientChange={setSelectedIngredient}
            onDirtyChange={setCatalogFormDirty}
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
            onDirtyChange={setCustomFormDirty}
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
          <div className="flex h-full min-h-[18rem] items-center justify-center rounded-xl border border-dashed border-border bg-muted/50 px-4 text-center text-sm text-muted-foreground">
            Выберите категорию, и после этого появится {mode === "catalog" ? "поиск" : "форма создания своего ингредиента"}.
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function AddIngredientModal({
  open,
  onClose,
  preferredCurrency,
  initialSelection,
  initialCategory,
  initialSubtype,
  initialGroup,
  initialQuantity,
  initialUnit,
  initialQuickStartDataByContext
}: Props) {
  const dirtyRef = useRef(false);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) {
            onClose();
          }
        }}
        title="Добавить ингредиент"
        hideTitle
        size="lg"
        guard={{
          isDirty: () => dirtyRef.current,
          onGuardedClose: () => setCloseConfirmOpen(true)
        }}
      >
        <DialogHeader>
          <h2 className="text-base font-semibold text-foreground">Добавить ингредиент</h2>
          <DialogCloseButton />
        </DialogHeader>
        <div className="p-5">
          <AddIngredientModalBody
            preferredCurrency={preferredCurrency}
            initialSelection={initialSelection}
            initialCategory={initialCategory}
            initialSubtype={initialSubtype}
            initialGroup={initialGroup}
            initialQuantity={initialQuantity}
            initialUnit={initialUnit}
            initialQuickStartDataByContext={initialQuickStartDataByContext}
            onClose={onClose}
            onDirtyChange={(dirty) => {
              dirtyRef.current = dirty;
            }}
          />
        </div>
      </Dialog>

      <ConfirmActionDialog
        open={closeConfirmOpen}
        title="Закрыть без сохранения?"
        description="Введённые данные будут потеряны."
        confirmLabel="Закрыть"
        tone="danger"
        onConfirm={() => {
          setCloseConfirmOpen(false);
          onClose();
        }}
        onClose={() => setCloseConfirmOpen(false)}
      />
    </>
  );
}
