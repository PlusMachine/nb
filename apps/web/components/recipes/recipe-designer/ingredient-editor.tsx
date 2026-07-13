"use client";

import { CircleAlert, Package, Search, Sparkles, Trash2, X } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";

import {
  createRecipeCustomIngredientAction,
  proposeRecipeIngredientAction
} from "@/app/(app)/app/recipes/actions";
import {
  IngredientPicker,
  IngredientSelectionCard
} from "@/components/ingredients/ingredient-picker";
import { CustomIngredientForm, type CustomIngredientSubmitPayload } from "@/components/inventory/custom-ingredient-form";
import { NumericInput } from "@/components/shared/numeric-input";
import { InventoryIngredientContextSummary, resolveInventoryIngredientContextSummary } from "@/components/inventory/inventory-ingredient-context-summary";
import { getInventoryUnitInputStep, inventoryUnitLabels, type InventoryUnit } from "@/features/inventory/units";
import { recipeFermentableUseTypes, type RecipeHopUseType } from "@/features/recipes/contracts";
import { StockIngredientList } from "@/components/recipes/stock-ingredient-list";
import { recipeWaterAddFlowCatalogIds } from "@/features/recipes/water-additives-catalog";
import { validateNumericInput } from "@/features/forms/numeric-validation";

import {
  resolveRecipeIngredientSearchType,
  resolveRecipeIngredientEditorSourceMode,
  resolveRecipeFermentablePickerScopeContext,
  buildRecipeFermentableForcedGroup,
  recipeConsumableSubtypeOptions,
  resolveRecipeIngredientForcedGroup,
  resolveRecipeIngredientEditorCategoryLabel,
  resolveRecipeFermentablePickerScopeFromIngredient,
  shouldAutoFocusRecipeIngredientPicker,
  hopUseTypeLabels,
  recipeHopUseTypeUiOrder,
  stageLabels,
  resolveRecipeConsumableStageOptions,
  fermentableUseLabels,
  resolveRecipeFermentableSubtype,
  applyHopUseTypeChange,
  applySelection,
  applyQueryChange,
  clearRecipeIngredientSelection,
  applyRecipeIngredientCategoryContextChange,
  buildSelectedIngredientPreview,
  getHopUseType,
  getSectionTitle,
  isImportedDesignerIngredient,
  searchStockIngredientsForRecipe,
  searchRecipeWaterAddFlowCatalogIngredients,
  type RecipeIngredientEditorSourceMode,
  type RecipeFermentablePickerScope,
  type DesignerIngredient
} from "./helpers";
import { RecipeIngredientCategoryGrid, RecipeFermentableScopePicker } from "./recipe-ingredient-category-grid";

export function IngredientEditor({
  draft,
  isExisting,
  boilTimeMinutes,
  onChange,
  onSave,
  onCancel,
  onDelete,
  saveLabel,
  fieldError
}: {
  draft: DesignerIngredient;
  isExisting: boolean;
  /** Время кипячения рецепта — дефолт поля «мин» у хмеля на кипячение. */
  boilTimeMinutes: number;
  onChange: (next: DesignerIngredient) => void;
  onSave: () => void;
  onCancel: () => void;
  onDelete?: () => void;
  saveLabel: string;
  fieldError?: string | null;
}) {
  const [pendingCustom, setPendingCustom] = useState(false);
  const [customMessage, setCustomMessage] = useState<string | null>(null);
  const [customFieldErrors, setCustomFieldErrors] = useState<Record<string, string> | undefined>(undefined);
  const [customDisplayName, setCustomDisplayName] = useState(draft.selectedName);
  const [showStockSearch, setShowStockSearch] = useState(false);
  // Подсказки о незаполненных полях показываем только после попытки сохранить,
  // чтобы свежеоткрытая форма не выглядела «сломанной» и красной.
  const [validationRevealed, setValidationRevealed] = useState(false);
  const [fermentableScope, setFermentableScope] = useState<RecipeFermentablePickerScope | null>(() => (
    resolveRecipeFermentablePickerScopeFromIngredient(draft)
  ));

  const isHop = draft.category === "hop";
  const isWaterTreatmentAddFlow = !isExisting && draft.category === "water_treatment";
  const hopUseType = getHopUseType(draft);
  const quantityStep = getInventoryUnitInputStep(draft.amountEnteredUnit);
  const hasIngredientSelection = Boolean(
    draft.ingredientCatalogItemId || draft.userCustomIngredientId || isImportedDesignerIngredient(draft)
  );
  const quantityNum = Number(draft.amountEnteredQuantity);
  const quantityFieldInvalid = hasIngredientSelection && (
    !draft.amountEnteredQuantity.trim() || !Number.isFinite(quantityNum) || quantityNum <= 0
  );
  // Обязательные числовые поля, зависящие от типа добавления. Используем ту же
  // проверку, что и блокировка сохранения, — чтобы подсветка и логика не расходились.
  const hopTimeRequired = isHop && (hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop");
  const hopTimeRaw = String(draft.stepMeta.timeMinutes ?? "");
  const hopTimeError = hopTimeRequired
    ? validateNumericInput(hopTimeRaw, { label: "Время", required: true, min: 0, max: 600, integer: true })
    : null;
  const hopDurationRequired = isHop && hopUseType === "dry_hop";
  const hopDurationRaw = String(draft.stepMeta.durationDays ?? "");
  const hopDurationError = hopDurationRequired
    ? validateNumericInput(hopDurationRaw, { label: "Длительность", min: 0, max: 365, integer: true, exclusiveMin: true })
    : null;

  // Что подсветить после попытки сохранить. По одному сигналу за раз, сверху вниз.
  const showIngredientHint = validationRevealed && !hasIngredientSelection;
  const showQuantityHint = validationRevealed && quantityFieldInvalid;
  const showHopTimeHint = validationRevealed && Boolean(hopTimeError);
  const showHopDurationHint = validationRevealed && Boolean(hopDurationError);
  // Нижняя строка — только для ошибок, не привязанных к подсвеченным полям выше
  // (например, выход температуры за диапазон), иначе сообщение задвоится.
  const showOtherError = validationRevealed
    && Boolean(fieldError)
    && !showIngredientHint
    && !showQuantityHint
    && !showHopTimeHint
    && !showHopDurationHint;

  // Обязательное и ещё пустое поле спокойно подсвечиваем рамкой, без красного.
  const requiredBorderClass = (invalid: boolean, awaiting: boolean) =>
    invalid ? "border-destructive-border" : awaiting ? "border-ring" : "border-border";
  const quantityAwaitingInput = hasIngredientSelection && !draft.amountEnteredQuantity.trim();
  const quantityBorderClass = requiredBorderClass(showQuantityHint, quantityAwaitingInput);
  const hopTimeBorderClass = requiredBorderClass(showHopTimeHint, hopTimeRequired && !hopTimeRaw.trim());
  const hopDurationBorderClass = requiredBorderClass(showHopDurationHint, hopDurationRequired && !hopDurationRaw.trim());

  const quantityInputRef = useRef<HTMLInputElement>(null);
  // Как только ингредиент выбран — ставим курсор на количество (следующий обязательный шаг).
  useEffect(() => {
    if (hasIngredientSelection && !draft.amountEnteredQuantity.trim()) {
      quantityInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasIngredientSelection]);
  const sourceMode = resolveRecipeIngredientEditorSourceMode(draft.inventoryIntentMode);
  const isWaterTreatmentCatalogMode = draft.category === "water_treatment" && sourceMode === "catalog";
  const fermentableScopeContext = resolveRecipeFermentablePickerScopeContext(fermentableScope);
  const resolvedDraftFermentableSubtype = resolveRecipeFermentableSubtype(draft.category, draft.subtype);
  const pickerSubtype = draft.category === "fermentable"
    ? sourceMode === "custom"
      ? resolvedDraftFermentableSubtype ?? fermentableScopeContext.subtype
      : fermentableScopeContext.subtype ?? resolvedDraftFermentableSubtype
    : resolvedDraftFermentableSubtype;
  const forcedFermentableGroup = draft.category === "fermentable"
    ? buildRecipeFermentableForcedGroup(fermentableScope)
    : null;
  const forcedRecipeIngredientGroup = resolveRecipeIngredientForcedGroup({
    category: draft.category,
    fermentableGroup: forcedFermentableGroup
  });
  const placeholder = draft.category === "fermentable"
    ? pickerSubtype === "malt"
      ? "Найти солод"
      : forcedFermentableGroup?.label
        ? `Найти ${forcedFermentableGroup.label.toLowerCase()}`
        : pickerSubtype === "fermentable"
          ? "Найти сахар, экстракт или другой сбраживаемый ингредиент"
          : "Найти солод, сахар или другой ферментируемый ингредиент"
    : {
      hop: "Найти сорт или форму хмеля",
      yeast: "Найти дрожжи",
      water_treatment: "Найти соль",
      consumable: "Найти Irish Moss, цедру, специю или другую добавку"
    }[draft.category];
  const ingredientSearchType = resolveRecipeIngredientSearchType({
    category: draft.category,
    type: draft.type
  });
  const selectedIngredientPreview = buildSelectedIngredientPreview(draft);
  const selectedStockPreview = sourceMode === "use_stock" && draft.inventorySelectionMeta?.inventoryItemId
    ? selectedIngredientPreview
    : null;
  const selectedCatalogPreview = sourceMode !== "use_stock" ? selectedIngredientPreview : null;
  const selectedPreview = selectedStockPreview ?? selectedCatalogPreview;
  const showRecipeFields = Boolean(selectedPreview || isImportedDesignerIngredient(draft));
  const showIngredientPicker = !selectedPreview && (
    sourceMode === "catalog"
    || (sourceMode === "use_stock" && showStockSearch)
  );
  const autoFocusPicker = shouldAutoFocusRecipeIngredientPicker({
    ingredient: draft,
    hasSelectedPreview: Boolean(selectedPreview),
    sourceMode
  });
  const contextCategoryLabel = resolveRecipeIngredientEditorCategoryLabel({
    category: draft.category
  }) ?? getSectionTitle(draft.category);
  const contextSummary = sourceMode === "use_stock"
    ? `${contextCategoryLabel} · Из склада`
    : draft.category === "fermentable"
      ? `${contextCategoryLabel} · ${sourceMode === "custom" ? "Свой" : "Из каталога"}`
      : resolveInventoryIngredientContextSummary({
        category: draft.category,
        subtype: draft.subtype,
        source: sourceMode === "custom" ? "custom" : "catalog"
      });
  const consumableStageOptions = draft.category === "consumable"
    ? resolveRecipeConsumableStageOptions(draft.technicalData)
    : [];
  const visibleConsumableStageOptions = draft.category === "consumable" && !consumableStageOptions.includes(draft.stage)
    ? [draft.stage, ...consumableStageOptions]
    : consumableStageOptions;

  useEffect(() => {
    if (sourceMode === "custom") {
      setCustomDisplayName(draft.selectedName);
    }
  }, [draft.selectedName, sourceMode]);

  useEffect(() => {
    setFermentableScope(resolveRecipeFermentablePickerScopeFromIngredient(draft));
  }, [draft.localId, draft.category]);

  const switchSourceMode = (mode: RecipeIngredientEditorSourceMode) => {
    if (mode === sourceMode) {
      return;
    }

    setShowStockSearch(false);
    setCustomMessage(null);
    setCustomFieldErrors(undefined);
    onChange({
      ...clearRecipeIngredientSelection(draft),
      inventoryIntentMode: mode,
      inventorySelectionMeta: null
    });
  };
  const switchToCustomWithCurrentName = () => {
    const cleared = clearRecipeIngredientSelection(draft);
    setShowStockSearch(false);
    setCustomMessage(null);
    setCustomFieldErrors(undefined);
    onChange({
      ...cleared,
      selectedName: draft.selectedName,
      inventoryIntentMode: "custom",
      inventorySelectionMeta: null
    });
  };
  const handleFermentableScopeChange = (nextScope: RecipeFermentablePickerScope | null) => {
    setShowStockSearch(false);
    setCustomMessage(null);
    setCustomFieldErrors(undefined);
    setFermentableScope(nextScope);
    onChange(applyRecipeIngredientCategoryContextChange(
      draft,
      "fermentable",
      resolveRecipeFermentablePickerScopeContext(nextScope).subtype,
      boilTimeMinutes
    ));
  };
  const createCustomIngredient = async (payload: CustomIngredientSubmitPayload) => {
    setPendingCustom(true);
    setCustomMessage(null);
    setCustomFieldErrors(undefined);
    const result = await createRecipeCustomIngredientAction({
      category: payload.category,
      subtype: payload.subtype,
      displayName: payload.displayName,
      brand: payload.brand,
      country: payload.country,
      harvestYear: payload.harvestYear,
      fermentableColorEbc: payload.fermentableColorEbc,
      fermentableExtractYieldPct: payload.fermentableExtractYieldPct,
      hopAlphaAcidPct: payload.hopAlphaAcidPct,
      hopForm: payload.hopForm,
      yeastAttenuationPct: payload.yeastAttenuationPct,
      yeastForm: payload.yeastForm,
      defaultDisplayUnit: payload.defaultDisplayUnit
    });
    setPendingCustom(false);
    setCustomFieldErrors(result.fieldErrors);
    if (!result.ok) {
      setCustomMessage(result.message);
    }

    if (result.ok && result.item) {
      onChange(applySelection({
        ...draft,
        inventoryIntentMode: "custom",
        inventorySelectionMeta: null
      }, result.item));
    }
  };
  const canCreateCustomIngredientFromEditor = draft.category !== "water_treatment";
  const emptyCta = ({
    hasActiveFilters,
    resetFilters
  }: {
    hasActiveFilters: boolean;
    resetFilters: () => void;
  }) => (
    <div className="space-y-3">
      <p className="text-sm text-foreground">
        {draft.category === "water_treatment"
          ? "Ничего не найдено"
          : `Ничего не нашли. Попробуйте сменить категорию${hasActiveFilters ? " или сбросить фильтры" : ""}, либо добавьте свой ингредиент.`}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {hasActiveFilters ? (
          <button
            type="button"
            onClick={resetFilters}
            className="inline-flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring hover:bg-accent hover:text-foreground"
          >
            Сбросить фильтры
          </button>
        ) : null}
        {canCreateCustomIngredientFromEditor ? (
          <>
            <button
              type="button"
              onClick={switchToCustomWithCurrentName}
              className="inline-flex items-center rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90"
            >
              Добавить свой ингредиент
            </button>
            <button
              type="button"
              disabled={!draft.selectedName.trim()}
              onClick={async () => {
                const result = await proposeRecipeIngredientAction({
                  category: draft.category,
                  subtype: pickerSubtype,
                  displayName: draft.selectedName.trim()
                });
                setCustomMessage(result.message);
              }}
              className="inline-flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring hover:bg-accent hover:text-foreground disabled:opacity-60"
            >
              Предложить в каталог
            </button>
          </>
        ) : null}
      </div>
      {customMessage ? <p className="text-xs text-muted-foreground">{customMessage}</p> : null}
    </div>
  );

  const sourceModeMeta: Record<RecipeIngredientEditorSourceMode, { label: string; icon: React.ReactNode; description: string }> = {
    use_stock: { label: "Из склада", icon: <Package className="h-3.5 w-3.5" />, description: "Использовать уже купленный" },
    catalog: { label: "Из каталога", icon: <Search className="h-3.5 w-3.5" />, description: "Подобрать по каталогу" },
    custom: { label: "Свой", icon: <Sparkles className="h-3.5 w-3.5" />, description: "Создать свой" }
  };
  const sourceModeOptions: RecipeIngredientEditorSourceMode[] =
    draft.category === "water_treatment"
      ? sourceMode === "custom"
        ? ["catalog", "use_stock", "custom"]
        : ["catalog", "use_stock"]
      : ["use_stock", "catalog", "custom"];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="sticky top-0 z-10 flex shrink-0 items-start justify-between gap-3 border-b border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-foreground sm:text-lg">
            {isWaterTreatmentAddFlow ? "Новая соль для воды" : isExisting ? "Редактор позиции" : "Новая позиция"}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{contextCategoryLabel}</p>
        </div>
        <button
          type="button"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          onClick={onCancel}
          aria-label="Закрыть"
          title="Закрыть"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
        {isWaterTreatmentAddFlow ? null : (
          <RecipeIngredientCategoryGrid
            value={draft.category}
            onChange={(nextCategory) => {
              setShowStockSearch(false);
              setCustomMessage(null);
              setCustomFieldErrors(undefined);
              setFermentableScope(null);
              onChange(applyRecipeIngredientCategoryContextChange(draft, nextCategory, null, boilTimeMinutes));
            }}
            legend="Категория ингредиента"
            testId="recipe-ingredient-category-grid"
          />
        )}

        <div>
          <span className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Источник</span>
          <div
            className={`grid gap-1.5 rounded-xl bg-muted p-1 ${sourceModeOptions.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}
            data-testid="recipe-ingredient-source-switch"
          >
            {sourceModeOptions.map((mode) => {
              const meta = sourceModeMeta[mode];
              const active = sourceMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => switchSourceMode(mode)}
                  className={`flex min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg px-2 py-2 text-xs font-medium transition-all sm:flex-row sm:gap-2 sm:py-2.5 sm:text-sm ${active ? "bg-card text-foreground shadow-sm ring-1 ring-ring" : "text-muted-foreground hover:text-foreground"}`}
                  aria-pressed={active}
                >
                  <span className={`shrink-0 ${active ? "text-foreground" : "text-muted-foreground"}`}>{meta.icon}</span>
                  <span className="truncate">{meta.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <InventoryIngredientContextSummary
          summary={contextSummary}
          testId="recipe-ingredient-context-summary"
        />

        {draft.category === "fermentable" && !selectedPreview && sourceMode !== "custom" ? (
          <RecipeFermentableScopePicker
            value={fermentableScope}
            onChange={handleFermentableScopeChange}
          />
        ) : null}

        <div className="space-y-1">
          <label className="text-xs font-medium text-foreground">Ингредиент</label>
          {selectedPreview ? (
            <IngredientSelectionCard
              item={selectedPreview}
              label={selectedStockPreview ? "Выбрано со склада" : selectedPreview.source === "custom" ? "Выбрано: свой ингредиент" : "Выбрано из каталога"}
              actionLabel="Изменить выбор"
              onAction={() => {
                setShowStockSearch(false);
                onChange(clearRecipeIngredientSelection(draft));
              }}
              hideTypedSummary={!selectedStockPreview || draft.category === "consumable"}
              hideSubtitle={!selectedStockPreview}
              mergeBrandAndCountry
            />
          ) : sourceMode === "custom" ? (
            <div className="space-y-3" data-testid="recipe-custom-ingredient-create-panel">
              <CustomIngredientForm
                mode="recipe"
                category={draft.category}
                initialSubtype={pickerSubtype}
                subtypeOptions={draft.category === "consumable" ? recipeConsumableSubtypeOptions : undefined}
                initialDisplayName={draft.selectedName}
                pending={pendingCustom}
                fieldErrors={customFieldErrors}
                submitLabel="Создать свой ингредиент"
                onDisplayNameChange={(value) => {
                  setCustomMessage(null);
                  setCustomDisplayName(value);
                }}
                onSubmit={createCustomIngredient}
              />
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!customDisplayName.trim()}
                  onClick={async () => {
                    const result = await proposeRecipeIngredientAction({
                      category: draft.category,
                      subtype: pickerSubtype,
                      displayName: customDisplayName.trim()
                    });
                    setCustomMessage(result.message);
                  }}
                  className="inline-flex items-center rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-ring hover:bg-accent hover:text-foreground disabled:opacity-60"
                >
                  Предложить в каталог
                </button>
              </div>
              {customMessage ? <p className="text-xs text-muted-foreground">{customMessage}</p> : null}
            </div>
          ) : (
            <>
              {showIngredientPicker ? (
                <IngredientPicker
                  type={ingredientSearchType}
                  category={draft.category}
                  subtype={pickerSubtype}
                  forcedGroup={forcedRecipeIngredientGroup}
                  hideForcedGroupChip
                  onForcedGroupClear={forcedFermentableGroup ? () => handleFermentableScopeChange(null) : undefined}
                  value={draft.selectedName}
                  onValueChange={(value) => onChange(applyQueryChange(draft, value))}
                  onSelect={(item) => {
                    setShowStockSearch(false);
                    onChange(applySelection(draft, item));
                  }}
                  searchIngredients={
                    sourceMode === "use_stock"
                      ? searchStockIngredientsForRecipe
                      : isWaterTreatmentCatalogMode
                        ? searchRecipeWaterAddFlowCatalogIngredients
                        : undefined
                  }
                  hydrateRecentSelectionsOnInit={sourceMode !== "use_stock"}
                  enableQuickStart={sourceMode !== "use_stock" && !isWaterTreatmentCatalogMode}
                  allowCustomOnlyFilter={sourceMode !== "use_stock" && !isWaterTreatmentCatalogMode}
                  searchOnEmptyQuery={isWaterTreatmentCatalogMode}
                  limit={isWaterTreatmentCatalogMode ? recipeWaterAddFlowCatalogIds.length : undefined}
                  autoFocus={autoFocusPicker}
                  placeholder={
                    sourceMode === "use_stock"
                      ? "Поиск по складу"
                      : isWaterTreatmentCatalogMode
                        ? "Найти соль"
                        : placeholder
                  }
                  emptyCta={emptyCta}
                />
              ) : null}
              <StockIngredientList
                active={sourceMode === "use_stock"}
                category={draft.category}
                type={ingredientSearchType}
                subtype={pickerSubtype}
                group={forcedRecipeIngredientGroup?.value ?? undefined}
                searchIngredients={searchStockIngredientsForRecipe}
                onOverflowChange={setShowStockSearch}
                onSelect={(item) => {
                  setShowStockSearch(false);
                  onChange(applySelection(draft, item));
                }}
              />
            </>
          )}
          {showIngredientHint ? (
            <p className="text-xs text-destructive">Выберите ингредиент из списка, чтобы продолжить.</p>
          ) : null}
        </div>

        {showRecipeFields ? (
          <>
            <div className="grid items-start gap-3 sm:grid-cols-[1fr_160px]">
              <div className="space-y-1">
                <label className="block text-xs font-medium text-foreground">Количество</label>
                <NumericInput
                  ref={quantityInputRef}
                  min={quantityStep}
                  step={quantityStep}
                  value={draft.amountEnteredQuantity}
                  onChange={(event) => onChange({ ...draft, amountEnteredQuantity: event.target.value })}
                  aria-invalid={showQuantityHint || undefined}
                  className={`h-10 w-full rounded-md border bg-card px-3 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring/10 ${quantityBorderClass}`}
                />
                {showQuantityHint ? (
                  <p className="text-xs text-destructive">Укажите количество больше нуля.</p>
                ) : null}
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-foreground">Ед. изм.</label>
                <select
                  value={draft.amountEnteredUnit}
                  onChange={(event) => onChange({ ...draft, amountEnteredUnit: event.target.value as InventoryUnit })}
                  className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/10"
                >
                  {draft.allowedUnits.map((unit) => (
                    <option key={unit} value={unit}>{inventoryUnitLabels[unit] ?? unit}</option>
                  ))}
                </select>
              </div>
            </div>

            {draft.category === "fermentable" ? (
              <div className="grid gap-3 sm:grid-cols-[180px_160px]">
                <label className="space-y-1 text-xs font-medium text-foreground">
                  Использование
                  <select
                    value={draft.stepMeta.use ?? "mash"}
                    onChange={(event) => onChange({
                      ...draft,
                      stage: event.target.value === "boil" ? "boil" : "mash",
                      stepMeta: {
                        ...draft.stepMeta,
                        use: event.target.value
                      }
                    })}
                    className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                  >
                    {recipeFermentableUseTypes.map((use) => <option key={use} value={use}>{fermentableUseLabels[use]}</option>)}
                  </select>
                </label>
                {(draft.stepMeta.use ?? "mash") === "boil" ? (
                  <label className="space-y-1 text-xs font-medium text-foreground">
                    Минут от конца
                    <NumericInput
                      integer
                      min={0}
                      max={600}
                      step={1}
                      value={draft.stepMeta.timeMinutes ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        timeOffset: event.target.value,
                        stepMeta: {
                          ...draft.stepMeta,
                          timeMinutes: event.target.value
                        }
                      })}
                      className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                    />
                  </label>
                ) : null}
              </div>
            ) : null}

            {isHop ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-foreground">
                  Тип добавления
                  <select
                    value={hopUseType}
                    onChange={(event) => onChange(applyHopUseTypeChange(
                      draft,
                      event.target.value as RecipeHopUseType,
                      boilTimeMinutes
                    ))}
                    className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                  >
                    {recipeHopUseTypeUiOrder.map((useType) => <option key={useType} value={useType}>{hopUseTypeLabels[useType]}</option>)}
                  </select>
                </label>

                {(hopUseType === "boil" || hopUseType === "whirlpool" || hopUseType === "dip_hop") ? (
                  <label className="space-y-1 text-xs font-medium text-foreground">
                    Минут
                    <NumericInput
                      integer
                      min={0}
                      max={600}
                      step={1}
                      value={draft.stepMeta.timeMinutes ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        timeOffset: event.target.value,
                        stepMeta: {
                          ...draft.stepMeta,
                          timeMinutes: event.target.value
                        }
                      })}
                      aria-invalid={showHopTimeHint || undefined}
                      className={`h-10 w-full rounded-md border bg-card px-3 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring/10 ${hopTimeBorderClass}`}
                    />
                    {showHopTimeHint ? (
                      <p className="text-xs font-normal text-destructive">{hopTimeError}</p>
                    ) : (
                      <p className="text-xs font-normal text-muted-foreground">Время задаёт горечь (IBU).</p>
                    )}
                  </label>
                ) : hopUseType === "dry_hop" ? (
                  <label className="space-y-1 text-xs font-medium text-foreground">
                    Длительность, дн
                    <NumericInput
                      integer
                      min={1}
                      max={365}
                      step={1}
                      value={draft.stepMeta.durationDays ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        stepMeta: {
                          ...draft.stepMeta,
                          durationDays: event.target.value
                        }
                      })}
                      aria-invalid={showHopDurationHint || undefined}
                      className={`h-10 w-full rounded-md border bg-card px-3 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring/10 ${hopDurationBorderClass}`}
                    />
                    {showHopDurationHint ? (
                      <p className="text-xs font-normal text-destructive">{hopDurationError}</p>
                    ) : null}
                  </label>
                ) : (
                  <label className="space-y-1 text-xs font-medium text-foreground">
                    Этап добавления
                    <input
                      value={draft.stepMeta.stageLabel ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        stepMeta: {
                          ...draft.stepMeta,
                          stageLabel: event.target.value
                        }
                      })}
                      className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                      placeholder="Например, первое сусло"
                    />
                  </label>
                )}

                {(hopUseType === "whirlpool" || hopUseType === "dip_hop") ? (
                  <label className="space-y-1 text-xs font-medium text-foreground">
                    Температура, °C
                    <NumericInput
                      min={0}
                      max={100}
                      step={0.1}
                      value={draft.stepMeta.temperatureC ?? ""}
                      onChange={(event) => onChange({
                        ...draft,
                        stepMeta: {
                          ...draft.stepMeta,
                          temperatureC: event.target.value
                        }
                      })}
                      placeholder="85"
                      className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/10"
                    />
                    <p className="text-xs font-normal text-muted-foreground">Если пусто — берётся 85&nbsp;°C.</p>
                  </label>
                ) : null}
              </div>
            ) : null}

            {draft.category === "yeast" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-foreground">
                  Основная температура брожения, °C
                  <NumericInput
                    min={-10}
                    max={50}
                    step={0.1}
                    value={draft.stepMeta.fermentationTempC ?? ""}
                    onChange={(event) => onChange({
                      ...draft,
                      stepMeta: {
                        ...draft.stepMeta,
                        fermentationTempC: event.target.value
                      }
                    })}
                    className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                  />
                </label>
                {draft.selectedSummary ? (
                  <div className="rounded-xl border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
                    {draft.selectedSummary}
                  </div>
                ) : null}
              </div>
            ) : null}

            {draft.category === "water_treatment" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium text-foreground">
                  Стадия
                  <select
                    value={draft.stage}
                    onChange={(event) => onChange({ ...draft, stage: event.target.value as DesignerIngredient["stage"] })}
                    className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                  >
                    {Object.entries(stageLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium text-foreground">
                  Время, если нужно
                  <NumericInput
                    integer
                    min={0}
                    max={600}
                    step={1}
                    value={draft.stepMeta.timeMinutes ?? ""}
                    onChange={(event) => onChange({
                      ...draft,
                      timeOffset: event.target.value,
                      stepMeta: {
                        ...draft.stepMeta,
                        timeMinutes: event.target.value
                      }
                    })}
                    className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                    placeholder="минуты"
                  />
                </label>
              </div>
            ) : null}

            {draft.category === "consumable" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <fieldset className="space-y-1">
                  <legend className="text-xs font-medium text-foreground">Стадия добавления</legend>
                  <div className="flex flex-wrap gap-1.5" data-testid="recipe-consumable-stage-options">
                    {visibleConsumableStageOptions.map((stage) => {
                      const active = draft.stage === stage;
                      return (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => onChange({ ...draft, stage })}
                          className={`rounded-md border px-2.5 py-1.5 text-xs font-medium transition-colors ${active
                            ? "border-foreground bg-foreground text-background"
                            : "border-border bg-card text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                          }`}
                          aria-pressed={active}
                        >
                          {stageLabels[stage]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <label className="space-y-1 text-xs font-medium text-foreground">
                  Время, если нужно
                  <NumericInput
                    integer
                    min={0}
                    max={600}
                    step={1}
                    value={draft.stepMeta.timeMinutes ?? ""}
                    onChange={(event) => onChange({
                      ...draft,
                      timeOffset: event.target.value,
                      stepMeta: {
                        ...draft.stepMeta,
                        timeMinutes: event.target.value
                      }
                    })}
                    className="h-10 w-full rounded-md border border-border bg-card px-3 text-sm text-foreground"
                    placeholder="минуты"
                  />
                </label>
              </div>
            ) : null}
          </>
        ) : null}

        {showOtherError ? (
          <p className="flex items-center gap-1.5 text-xs text-destructive">
            <CircleAlert className="h-3.5 w-3.5 shrink-0" />
            <span>{fieldError}</span>
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card px-4 py-3 sm:px-6 sm:py-4">
        <div>
          {onDelete ? (
            <button
              type="button"
              onClick={onDelete}
              className="inline-flex h-11 items-center gap-1.5 rounded-lg border border-destructive-border bg-card px-3 text-sm font-medium text-destructive transition-colors hover:border-destructive-border hover:bg-destructive-subtle"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Удалить</span>
            </button>
          ) : null}
        </div>
        <div className="flex flex-1 justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex h-11 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            Отмена
          </button>
          {showRecipeFields ? (
            <button
              type="button"
              onClick={() => {
                setValidationRevealed(true);
                onSave();
              }}
              className="inline-flex h-11 items-center rounded-lg bg-foreground px-4 text-sm font-medium text-background shadow-sm transition-colors hover:bg-foreground/90"
            >
              {saveLabel}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
