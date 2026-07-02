"use client";

import { getBeerStyleById } from "@nb/brewing-core";
import {
  CircleCheck,
  CircleAlert,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Lock,
  Plus,
  SlidersHorizontal,
  StickyNote
} from "lucide-react";
import React, { startTransition, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createRecipeCustomIngredientAction,
  createRecipeVersionAction,
  consumeRecipeInventoryAction,
  exportRecipeBeerXmlAction,
  getRecipeStockCoverageAction,
  importBeerXmlRecipeAction,
  importBrewfatherJsonRecipeAction,
  previewRecipeDraftAction,
  releaseRecipeInventoryAction,
  reserveRecipeInventoryAction,
  syncRecipeInventoryAllocationsAction,
  type RecipeEditorPayload,
  type RecipeEditorResult,
  type RecipeInventoryActionResult
} from "@/app/(app)/app/recipes/actions";
import { ConfirmActionDialog } from "@/components/shared/confirm-action-dialog";
import {
  type EquipmentProfileDto,
  type EquipmentProfileSnapshot
} from "@/features/equipment-profiles/contracts";
import { calculateEquipmentVolumePlan } from "@/features/equipment-profiles/volume-plan";
import type {
  IngredientCategory,
  IngredientSuggestionItem,
  IngredientTechnicalData
} from "@/features/ingredients/contracts";
import { type InventoryUnit } from "@/features/inventory/units";
import {
  defaultRecipeProcessMeta,
  type RecipeDetailDto,
  type RecipeDraftPreviewDto,
  type RecipeProcessMeta,
  type RecipePublicationState,
  type RecipeStockCoverageDto
} from "@/features/recipes/contracts";
import { formatGravity, formatGravityRange, type PreferredGravityUnit } from "@/features/system/gravity-units";
import { BitternessSettingsDrawer } from "@/components/recipes/bitterness-settings-drawer";
import { ImportExportModal, type ImportExportActionResult } from "@/components/recipes/import-export-modal";
import { IngredientAddDrawer } from "@/components/recipes/ingredient-add-drawer";
import { BrewPickerDialog } from "@/components/recipes/brew-picker-dialog";
import { PublicationReadinessDialog } from "@/components/recipes/publication-readiness-dialog";
import { RecipeActionsMenu } from "@/components/recipes/recipe-actions-menu";
import { RecipeImagesSection } from "@/components/recipes/recipe-images-section";
import {
  getRecipeWaterSetupToggleLabel,
  RecipeWaterAdditivesSection
} from "@/components/recipes/recipe-water-additives-section";
import { StockCoverageSummary, StockConsumeDialog } from "@/components/recipes/stock-coverage-summary";
import {
  setRecipeWaterSaltCalculationMode,
  WaterSetupWizard
} from "@/components/recipes/water-setup-wizard";
import { buildRecipePublicationChecklist } from "@/features/recipes/publication-validation";
import type { RecipeImageDto } from "@/features/recipe-images/contracts";
import { buildRecipeWaterPlanResult } from "@/features/recipes/water-plan";
import { scaleRecipeToVolume } from "@/features/recipes/scale";

import {
  buildRecipeEditHref,
  replaceRecipeEditorUrl,
  hopUseTypeLabels,
  hopUseTypeSectionLabels,
  recipeHopUseTypeUiOrder,
  recipeAdditionalHopUseTypeUiOrder,
  cloneRecipeProcessMeta,
  cloneRecipeCalculationMeta,
  cloneRecipeWaterPlanMeta,
  cloneEquipmentProfileSnapshot,
  buildEquipmentProfileSnapshotFromDto,
  formatEquipmentProfileRecipeValue,
  normalizeSavePayload,
  normalizeEditorPublicationState,
  applySelection,
  serializeIngredient,
  getHopUseType,
  buildIngredientPayload,
  toDesignerIngredient,
  buildInitialPreview,
  buildEditorPayloadFromRecipe,
  categoryIcons,
  categoryIconBg,
  getCategoryRows,
  getFermentableWeightTotalKg,
  getBatchVolumeLiters,
  buildDesignerScaleInput,
  shouldShowRescaleToVolumeAction,
  getFermentablesForWaterPlan,
  getFermentablePercentage,
  getHopWeightTotalG,
  getHopTimeMinutesValue,
  readImportedDesignerIngredientSnapshot,
  isIngredientValid,
  getIngredientDraftFieldError,
  applyRecipeWaterAddFlowSaltToWaterPlan,
  type DesignerIngredient,
  type OpenEditorState
} from "./helpers";
import { StylePicker } from "./style-picker";
import { RecipeStyleStatsBlock } from "./recipe-style-stats-block";
import { RecipeBatchParametersBlock } from "./recipe-batch-parameters-block";
import { SectionRow, WaterTreatmentSectionRow } from "./section-row";
import { RecipeProfiles } from "./recipe-profiles";
import { IngredientEditor } from "./ingredient-editor";
import { useRecipeIngredients } from "./hooks/use-recipe-ingredients";
import { useRecipeWaterPlan } from "./hooks/use-recipe-water-plan";
import { useRecipeCalculationMeta } from "./hooks/use-recipe-calculation-meta";
import { useRecipePublicationState } from "./hooks/use-recipe-publication-state";
import { useRecipeAutosave, type RecipeSaveStatus } from "./hooks/use-recipe-autosave";

type Props = {
  mode: "create" | "edit";
  initialRecipe?: RecipeDetailDto;
  initialTitle?: string;
  initialIngredientSelection?: IngredientSuggestionItem | null;
  initialStockCoverage?: RecipeStockCoverageDto | null;
  initialImages?: RecipeImageDto[];
  equipmentProfiles?: EquipmentProfileDto[];
  onSaveStatusChange?: (status: RecipeSaveStatus) => void;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
  onPublicationStateChange?: (state: RecipePublicationState) => void;
  preferredGravityUnit: PreferredGravityUnit;
};

export type { RecipeSaveStatus };

export function RecipeDesigner({
  mode,
  initialRecipe,
  initialTitle,
  initialIngredientSelection = null,
  initialStockCoverage = null,
  initialImages = [],
  equipmentProfiles = [],
  onSaveStatusChange,
  onRecipeCreated,
  onPublicationStateChange,
  preferredGravityUnit
}: Props) {
  const router = useRouter();
  const initialDefaultEquipmentProfile = initialRecipe
    ? null
    : equipmentProfiles.find((profile) => profile.isDefault) ?? equipmentProfiles[0] ?? null;
  const initialSavedEquipmentProfile = initialRecipe?.equipmentProfileId
    ? equipmentProfiles.find((profile) => profile.id === initialRecipe.equipmentProfileId) ?? null
    : null;
  const initialSelectedEquipmentProfile = initialRecipe ? initialSavedEquipmentProfile : initialDefaultEquipmentProfile;
  const [title, setTitle] = useState(initialRecipe?.title ?? initialTitle ?? "");
  const [styleId, setStyleId] = useState(initialRecipe?.styleId ?? "");
  const [description, setDescription] = useState(initialRecipe?.description ?? "");
  const [authorNotes, setAuthorNotes] = useState(initialRecipe?.authorNotes ?? "");
  const {
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
  } = useRecipePublicationState({ initialRecipe, onPublicationStateChange });
  const [batchSize, setBatchSize] = useState({
    quantity: initialRecipe
      ? String(initialRecipe.batchSizeEnteredQuantity)
      : String(initialDefaultEquipmentProfile?.targetBatchVolumeL ?? 20),
    unit: "l" as InventoryUnit
  });
  const [efficiency, setEfficiency] = useState(initialRecipe?.efficiency != null
    ? String(initialRecipe.efficiency)
    : String(initialDefaultEquipmentProfile?.brewhouseEfficiencyPct ?? 75));
  const [boilTimeMinutes, setBoilTimeMinutes] = useState(initialRecipe?.boilTimeMinutes != null ? String(initialRecipe.boilTimeMinutes) : "60");
  const [processMeta, setProcessMeta] = useState<RecipeProcessMeta>(() => cloneRecipeProcessMeta(initialRecipe?.processMeta ?? defaultRecipeProcessMeta));
  const { calculationMeta, setCalculationMeta } = useRecipeCalculationMeta({ initialRecipe });
  const {
    waterPlanMeta,
    setWaterPlanMeta,
    waterSetupOpen,
    setWaterSetupOpen,
    waterResetConfirmOpen,
    setWaterResetConfirmOpen,
    openWaterSetup,
    closeWaterSetup,
    resetWaterSetup,
    updateRecipeWaterManualSalt,
    removeManualSaltAddition,
    applyAcidConcentration
  } = useRecipeWaterPlan({ initialRecipe });
  const [equipmentProfileId, setEquipmentProfileId] = useState<string | null>(initialSelectedEquipmentProfile?.id ?? null);
  const [equipmentProfileSnapshot, setEquipmentProfileSnapshot] = useState<EquipmentProfileSnapshot | null>(() => (
    initialRecipe
      ? (
        initialSavedEquipmentProfile
          ? cloneEquipmentProfileSnapshot(initialRecipe.equipmentProfileSnapshot ?? null)
            ?? buildEquipmentProfileSnapshotFromDto(initialSavedEquipmentProfile)
          : null
      )
      : (initialDefaultEquipmentProfile ? buildEquipmentProfileSnapshotFromDto(initialDefaultEquipmentProfile) : null)
  ));
  const {
    ingredients,
    setIngredients,
    openEditor,
    setOpenEditor,
    maybeOpenEditor,
    closeEditor,
    openAddEditor,
    deleteIngredient,
    openImportedCatalogMatcher,
    updateIngredientQuantity,
    updateHopTimeMinutes
  } = useRecipeIngredients({ initialRecipe, initialIngredientSelection });
  const [stockCoverage, setStockCoverage] = useState<RecipeStockCoverageDto | null>(initialStockCoverage);
  const [beerXmlExport, setBeerXmlExport] = useState("");
  const [beerXmlImport, setBeerXmlImport] = useState("");
  const [brewfatherJsonImport, setBrewfatherJsonImport] = useState("");
  const [preview, setPreview] = useState<RecipeDraftPreviewDto | null>(buildInitialPreview(initialRecipe));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [recalculating, setRecalculating] = useState(false);
  const [bitternessSettingsOpen, setBitternessSettingsOpen] = useState(false);
  const [stockConsumeDialogOpen, setStockConsumeDialogOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [brewPickerOpen, setBrewPickerOpen] = useState(false);
  const [brewPickerRecipeId, setBrewPickerRecipeId] = useState<string | null>(null);

  const payload = useMemo<RecipeEditorPayload>(() => ({
    title,
    styleId: styleId.trim() || null,
    description: description.trim() || null,
    authorNotes: authorNotes.trim() || null,
    publicationState,
    batchSizeEnteredQuantity: Number(batchSize.quantity || 0),
    batchSizeEnteredUnit: batchSize.unit,
    efficiency: efficiency.trim() ? Number(efficiency) : null,
    boilTimeMinutes: Number(boilTimeMinutes || 0),
    processMeta,
    calculationMeta,
    equipmentProfileId,
    equipmentProfileSnapshot,
    waterPlanMeta,
    ingredients: ingredients.map(buildIngredientPayload)
  }), [authorNotes, batchSize.quantity, batchSize.unit, boilTimeMinutes, calculationMeta, description, efficiency, equipmentProfileId, equipmentProfileSnapshot, ingredients, processMeta, publicationState, styleId, title, waterPlanMeta]);
  const batchVolumeL = useMemo(
    () => getBatchVolumeLiters(batchSize.quantity, batchSize.unit),
    [batchSize.quantity, batchSize.unit],
  );
  const fermentableWeightKg = useMemo(
    () => getFermentableWeightTotalKg(ingredients),
    [ingredients],
  );
  const equipmentVolumePlan = useMemo(() => {
    if (!equipmentProfileSnapshot) {
      return null;
    }

    const effectiveEquipmentProfile = {
      ...equipmentProfileSnapshot,
      targetBatchVolumeL:
        batchVolumeL ?? equipmentProfileSnapshot.targetBatchVolumeL,
      grainAbsorptionLPerKg:
        waterPlanMeta.grainAbsorptionLPerKg ??
        equipmentProfileSnapshot.grainAbsorptionLPerKg,
    };

    return {
      ...calculateEquipmentVolumePlan(
        effectiveEquipmentProfile,
        fermentableWeightKg,
        Number(boilTimeMinutes || 0),
      ),
      grainAbsorptionLPerKg: effectiveEquipmentProfile.grainAbsorptionLPerKg,
    };
  }, [
    batchVolumeL,
    boilTimeMinutes,
    equipmentProfileSnapshot,
    fermentableWeightKg,
    waterPlanMeta.grainAbsorptionLPerKg,
  ]);
  const waterPlanResult = useMemo(() => buildRecipeWaterPlanResult({
    waterPlanMeta,
    fallbackBatchVolumeL: batchVolumeL,
    boilTimeMinutes: Number(boilTimeMinutes || 0),
    equipmentVolumePlan,
    grainKg: fermentableWeightKg,
    beerSrm: preview?.color ?? initialRecipe?.color ?? null,
    fermentables: getFermentablesForWaterPlan(ingredients)
  }), [batchVolumeL, boilTimeMinutes, equipmentVolumePlan, fermentableWeightKg, ingredients, initialRecipe?.color, preview?.color, waterPlanMeta]);
  const calculatedWaterPlanMeta = useMemo(
    () => setRecipeWaterSaltCalculationMode(waterPlanMeta, "auto"),
    [waterPlanMeta],
  );
  const calculatedWaterPlanResult = useMemo(() => buildRecipeWaterPlanResult({
    waterPlanMeta: calculatedWaterPlanMeta,
    fallbackBatchVolumeL: batchVolumeL,
    boilTimeMinutes: Number(boilTimeMinutes || 0),
    equipmentVolumePlan,
    grainKg: fermentableWeightKg,
    beerSrm: preview?.color ?? initialRecipe?.color ?? null,
    fermentables: getFermentablesForWaterPlan(ingredients)
  }), [batchVolumeL, boilTimeMinutes, calculatedWaterPlanMeta, equipmentVolumePlan, fermentableWeightKg, ingredients, initialRecipe?.color, preview?.color]);
  const savePayload = useMemo(() => normalizeSavePayload(payload), [payload]);

  const currentSignature = useMemo(() => JSON.stringify(payload), [payload]);
  const {
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
  } = useRecipeAutosave({
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
  });

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setRecalculating(true);
      const result = await previewRecipeDraftAction(savePayload);
      startTransition(() => {
        if (cancelled) {
          return;
        }

        if (result.ok && result.preview) {
          setPreview(result.preview);
          setPreviewError(null);
        } else {
          setPreviewError(result.message ?? "Не удалось обновить расчёт.");
        }
        setRecalculating(false);
      });
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [savePayload]);

  const saveEditor = () => {
    if (!openEditor || !isIngredientValid(openEditor.draft)) {
      return;
    }

    if (!openEditor.localId && openEditor.category === "water_treatment") {
      const nextWaterPlanMeta = applyRecipeWaterAddFlowSaltToWaterPlan({
        waterPlanMeta,
        waterPlanResult,
        ingredient: openEditor.draft,
      });

      if (nextWaterPlanMeta) {
        setWaterPlanMeta(nextWaterPlanMeta);
        setWaterSetupOpen(true);
        setOpenEditor(null);
        return;
      }

      return;
    }

    if (openEditor.localId) {
      setIngredients((current) => current.map((ingredient) => ingredient.localId === openEditor.localId ? openEditor.draft : ingredient));
    } else {
      setIngredients((current) => [...current, openEditor.draft]);
    }
    setOpenEditor(null);
  };

  const addImportedIngredientAsCustom = async (ingredient: DesignerIngredient) => {
    const snapshot = readImportedDesignerIngredientSnapshot(ingredient);
    const displayName = snapshot?.name?.trim() || ingredient.selectedName.trim();
    if (!displayName) {
      return;
    }

    setPendingSave(true);
    try {
      const result = await createRecipeCustomIngredientAction({
        category: ingredient.category,
        subtype: ingredient.subtype,
        displayName,
        defaultDisplayUnit: snapshot?.defaultDisplayUnit ?? ingredient.defaultDisplayUnit,
        technicalData: (snapshot?.technicalData ?? null) as IngredientTechnicalData | null
      });
      setSaveResult({ ok: result.ok, message: result.message });
      setSaveResultSignature(currentSignature);

      if (result.ok && result.item) {
        setIngredients((current) => current.map((line) => (
          line.localId === ingredient.localId
            ? applySelection({
              ...line,
              inventoryIntentMode: "custom",
              inventorySelectionMeta: null
            }, result.item!)
            : line
        )));
      }
    } catch {
      setSaveResult({ ok: false, message: "Не удалось сохранить ингредиент — проверьте соединение." });
      setSaveResultSignature(currentSignature);
    } finally {
      setPendingSave(false);
    }
  };

  const handleSelectEquipmentProfile = React.useCallback((profileId: string | null) => {
    if (!profileId) {
      setEquipmentProfileId(null);
      setEquipmentProfileSnapshot(null);
      return;
    }

    const profile = equipmentProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    setEquipmentProfileId(profile.id);
    setEquipmentProfileSnapshot(buildEquipmentProfileSnapshotFromDto(profile));
    setBatchSize((current) => ({
      ...current,
      quantity: formatEquipmentProfileRecipeValue(profile.targetBatchVolumeL)
    }));
    setEfficiency(formatEquipmentProfileRecipeValue(profile.brewhouseEfficiencyPct));
  }, [equipmentProfiles]);

  // Инлайн-действие «Пересчитать под объём» (#6): доступно, только когда текущий
  // объём разошёлся с уже сохранённым и в рецепте есть что масштабировать. По
  // умолчанию количества НЕ трогаются — это явное действие, а не побочный эффект
  // ввода объёма. Масштабирует чистой `scaleRecipeToVolume` (features/recipes/scale.ts)
  // от сохранённого объёма-базы к текущему введённому — не мутирует и не сохраняет сама.
  const canRescaleToVolume = shouldShowRescaleToVolumeAction({
    savedBatchVolumeL,
    currentBatchVolumeL: batchVolumeL,
    ingredientCount: ingredients.length
  });
  const handleRescaleToVolume = React.useCallback(() => {
    if (savedBatchVolumeL == null || savedBatchVolumeL <= 0 || batchVolumeL == null || batchVolumeL <= 0) {
      return;
    }

    const scaleInput = buildDesignerScaleInput(ingredients, savedBatchVolumeL);
    const scaled = scaleRecipeToVolume(scaleInput, batchVolumeL);
    if (!scaled.scaled) {
      return;
    }

    const scaledByKey = new Map(scaled.ingredients.map((item) => [item.persistentKey, item]));
    setIngredients((current) => current.map((ingredient) => {
      const scaledIngredient = scaledByKey.get(ingredient.persistentKey);
      return scaledIngredient
        ? { ...ingredient, amountEnteredQuantity: String(scaledIngredient.amountEnteredQuantity) }
        : ingredient;
    }));
  }, [batchVolumeL, ingredients, savedBatchVolumeL]);

  const sectionErrors = visibleSaveResult?.fieldErrors ?? {};
  const publicationValidationContext = {
    title,
    styleId: styleId.trim() || null,
    description: description.trim() || null,
    boilTimeMinutes: savePayload.boilTimeMinutes,
    ingredientCategories: ingredients.map((ingredient) => ingredient.category ?? null)
  };
  const publishChecklist = useMemo(() => buildRecipePublicationChecklist({
    ...publicationValidationContext,
    publicationState: "published"
  }), [description, ingredients, savePayload.boilTimeMinutes, styleId, title]);
  const isPublishReady = publishChecklist.every((item) => item.isSatisfied);
  const canManagePublication = Boolean(activeRecipeId);
  const savedVisibility = savedPublicationState === "published" ? "published" : "private";
  const fermentables = getCategoryRows(ingredients, "fermentable");
  const hops = getCategoryRows(ingredients, "hop");
  const yeasts = getCategoryRows(ingredients, "yeast");
  const waterTreatments = getCategoryRows(ingredients, "water_treatment");
  const consumables = getCategoryRows(ingredients, "consumable");

  const fermentableTotalKg = getFermentableWeightTotalKg(fermentables);
  const hopTotalG = getHopWeightTotalG(hops);
  const computedWaterAdditiveCount = useMemo(() => {
    if (!waterPlanMeta.setupEnabled || waterPlanMeta.engine !== "advanced_manual") {
      return 0;
    }
    const isSplit = waterPlanResult.waterVolumes.source === "manual_split";
    const saltCount = isSplit
      ? waterPlanResult.mashSaltAdditions.filter((s) => s.grams > 0).length
        + waterPlanResult.spargeSaltAdditions.filter((s) => s.grams > 0).length
      : waterPlanResult.totalSaltAdditions.filter((s) => s.grams > 0).length;
    const acidCount = (waterPlanResult.mashAcidAddition?.mashAcidMl ?? 0) > 0 ? 1 : 0;
    const spargeAcidCount = (waterPlanResult.spargeAcidAddition?.spargeAcidMl ?? 0) > 0 ? 1 : 0;
    return saltCount + acidCount + spargeAcidCount;
  }, [waterPlanMeta.setupEnabled, waterPlanResult]);

  const sectionDefinitions: Array<{
    category: IngredientCategory;
    title: string;
    subtitle?: string;
    items: DesignerIngredient[];
    empty: string;
    renderItems?: (items: DesignerIngredient[]) => React.ReactNode;
  }> = [
      {
        category: "fermentable",
        title: "Сбраживаемое",
        subtitle: fermentables.length ? `${fermentableTotalKg.toFixed(2)} кг` : undefined,
        items: fermentables,
        empty: "Добавьте солод, сахар, экстракт или другие сбраживаемые.",
      },
      {
        category: "hop",
        title: "Хмель",
        subtitle: hops.length ? `${hopTotalG.toFixed(0)} г` : undefined,
        items: hops,
        empty: "Пока нет хмеля. Добавьте кипячение, whirlpool, dry hop или dip hop.",
        renderItems: (items) => {
          const usedTypes = recipeHopUseTypeUiOrder.filter(
            (useType) => useType === "boil" || items.some((item) => getHopUseType(item) === useType)
          );
          const unusedTypes = recipeAdditionalHopUseTypeUiOrder.filter(
            (useType) => !items.some((item) => getHopUseType(item) === useType)
          );
          return (
            <div className="space-y-3">
              {usedTypes.map((useType) => {
                const rows = items
                  .filter((item) => getHopUseType(item) === useType)
                  .sort((left, right) => getHopTimeMinutesValue(right) - getHopTimeMinutesValue(left));
                return (
                  <div key={useType} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-1 pb-1.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-500">{hopUseTypeSectionLabels[useType]}</h4>
                      {rows.length ? <button type="button" onClick={() => openAddEditor("hop", useType)} className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                        + Добавить
                      </button> : null}
                    </div>
                    {rows.length ? (
                      <ul className="space-y-1.5">
                        {rows.map((ingredient) => (
                          <SectionRow
                            key={ingredient.localId}
                            ingredient={ingredient}
                            onEdit={(value) => maybeOpenEditor({
                              localId: value.localId,
                              category: value.category,
                              draft: { ...value },
                              initialSignature: serializeIngredient(value),
                              isExisting: true
                            })}
                            onDelete={deleteIngredient}
                            onQuantityChange={updateIngredientQuantity}
                            onTimeChange={updateHopTimeMinutes}
                            onAddImportedAsCustom={addImportedIngredientAsCustom}
                            onMapImportedSource={openImportedCatalogMatcher}
                          />
                        ))}
                      </ul>
                    ) : (
                      <button
                        type="button"
                        onClick={() => openAddEditor("hop", useType)}
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 px-4 py-6 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700"
                      >
                        <Plus className="h-4 w-4" />
                        <span>Добавьте хмель на кипячение</span>
                      </button>
                    )}
                  </div>
                );
              })}
              {unusedTypes.length ? (
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-semibold text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-800">
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                    Другие типы охмеления
                  </summary>
                  <div className="mt-2 space-y-3">
                    {unusedTypes.map((useType) => (
                      <div key={useType} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-zinc-200 px-3 py-2">
                        <span className="text-xs text-zinc-500">{hopUseTypeLabels[useType]}</span>
                        <button type="button" onClick={() => openAddEditor("hop", useType)} className="rounded-md px-2 py-1 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700">
                          + Добавить
                        </button>
                      </div>
                    ))}
                  </div>
                </details>
              ) : null}
            </div>
          );
        }
      },
      {
        category: "yeast",
        title: "Дрожжи",
        items: yeasts,
        empty: "Добавьте дрожжи для публикации рецепта."
      },
      {
        category: "water_treatment",
        title: "Водоподготовка",
        subtitle:
          computedWaterAdditiveCount + waterTreatments.length > 0
            ? `${computedWaterAdditiveCount + waterTreatments.length} поз.`
            : undefined,
        items: waterTreatments,
        empty: "Нет добавок воды.",
        renderItems: (items) => (
          <div className="space-y-3">
            <RecipeWaterAdditivesSection
              waterPlanMeta={waterPlanMeta}
              waterPlanResult={waterPlanResult}
              onUpdateManualSalt={updateRecipeWaterManualSalt}
              onRemoveManualSalt={removeManualSaltAddition}
              onApplyAcidConcentration={applyAcidConcentration}
              onAddManualSalt={() => openAddEditor("water_treatment")}
            />
            {items.length ? (
              <ul className="space-y-2 px-3 pb-3 sm:px-4 sm:pb-4">
                {items.map((ingredient) => (
                  <WaterTreatmentSectionRow
                    key={ingredient.localId}
                    ingredient={ingredient}
                    onEdit={(value) => maybeOpenEditor({
                      localId: value.localId,
                      category: value.category,
                      draft: { ...value },
                      initialSignature: serializeIngredient(value),
                      isExisting: true
                    })}
                    onDelete={deleteIngredient}
                    onQuantityChange={updateIngredientQuantity}
                  />
                ))}
              </ul>
            ) : null}
            <div className="px-3 pb-3 sm:px-4 sm:pb-4">
              <WaterSetupWizard
                variant="embedded"
                isOpen={waterSetupOpen}
                onIsOpenChange={setWaterSetupOpen}
                waterPlanMeta={waterPlanMeta}
                waterPlanResult={waterPlanResult}
                calculatedWaterPlanResult={calculatedWaterPlanResult}
                styleId={styleId.trim() || null}
                onChange={setWaterPlanMeta}
              />
            </div>
          </div>
        ),
      },
      {
        category: "consumable",
        title: "Другие добавки",
        subtitle: consumables.length ? `${consumables.length} поз.` : undefined,
        items: consumables,
        empty: "Irish Moss, Whirlfloc, нутриенты, цедру, специи и другие рецептные добавки можно держать здесь."
      }
    ];

  const editorFieldError = openEditor ? getIngredientDraftFieldError(openEditor.draft) : null;
  const editorPanel = openEditor ? (
    <IngredientEditor
      draft={openEditor.draft}
      isExisting={openEditor.isExisting}
      onChange={(next) => setOpenEditor((current) => current ? { ...current, draft: next } : current)}
      onSave={saveEditor}
      onCancel={() => closeEditor()}
      onDelete={openEditor.localId ? () => deleteIngredient(openEditor.localId!) : undefined}
      saveLabel={openEditor.localId ? "Сохранить позицию" : openEditor.category === "water_treatment" ? "Добавить соль" : "Добавить позицию"}
      fieldError={editorFieldError}
    />
  ) : null;

  const handlePublishClick = () => {
    setPublishError(null);
    if (!isPublishReady) {
      setReadinessDialogOpen(true);
      return;
    }

    setPublishConfirmOpen(true);
  };

  const handlePublishConfirm = async () => {
    setPublishError(null);
    const result = await persistRecipe({
      nextPublicationState: "published",
      surfaceInlineResult: false
    });

    if (result?.ok) {
      setPublishConfirmOpen(false);
      return;
    }

    if (result?.fieldErrors && Object.keys(result.fieldErrors).length) {
      setPublishConfirmOpen(false);
      setReadinessDialogOpen(true);
      return;
    }

    // Не-field ошибка (сеть/сервер): оставляем диалог открытым с текстом и
    // возможностью повторить — статус не врёт «опубликовано» (P0-2).
    setPublishError(result?.message ?? "Не удалось опубликовать — попробуйте ещё раз.");
  };

  const handleMakePrivateConfirm = async () => {
    setMakePrivateError(null);
    const result = await persistRecipe({
      nextPublicationState: "private",
      surfaceInlineResult: false
    });

    if (result?.ok) {
      setMakePrivateConfirmOpen(false);
      return;
    }

    setMakePrivateError(result?.message ?? "Не удалось изменить доступ — попробуйте ещё раз.");
  };

  const handleVersionChange = async (nextRecipeId: string) => {
    if (!nextRecipeId || nextRecipeId === activeRecipeId) {
      return;
    }

    // Сохраняем текущие правки перед навигацией к другой версии (#14),
    // как это делает handleCreateVersion — иначе несохранённое теряется молча.
    const saveBeforeSwitch = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeSwitch && !saveBeforeSwitch.ok) {
      return;
    }

    startTransition(() => {
      router.push(buildRecipeEditHref(nextRecipeId));
    });
  };

  const handleCreateVersion = async () => {
    if (!activeRecipeId || pendingSave) {
      return;
    }

    const saveBeforeVersionResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeVersionResult && !saveBeforeVersionResult.ok) {
      return;
    }

    setPendingSave(true);
    try {
      const result = await createRecipeVersionAction(activeRecipeId);

      if (!result.ok || !result.recipe) {
        setSaveResult(result);
        setSaveResultSignature(currentSignature);
        return;
      }

      const nextRecipe = result.recipe;
      startTransition(() => {
        router.push(buildRecipeEditHref(nextRecipe.id));
      });
    } catch {
      setSaveResult({ ok: false, message: "Не удалось создать версию — проверьте соединение." });
      setSaveResultSignature(currentSignature);
    } finally {
      setPendingSave(false);
    }
  };

  // Возвращает успех/провал (а не void), чтобы вызывающая сторона могла решить
  // судьбу своего UI — например, закрыть StockConsumeDialog только при успехе (#8/#9).
  const runInventoryAction = async (action: "sync" | "reserve" | "consume" | "release"): Promise<boolean> => {
    const saveBeforeInventoryResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeInventoryResult && !saveBeforeInventoryResult.ok) {
      return false;
    }

    const recipeId = saveBeforeInventoryResult?.recipe?.id ?? activeRecipeId;
    if (!recipeId) {
      return false;
    }

    const actionMap: Record<typeof action, (recipeId: string) => Promise<RecipeInventoryActionResult>> = {
      sync: syncRecipeInventoryAllocationsAction,
      reserve: reserveRecipeInventoryAction,
      consume: consumeRecipeInventoryAction,
      release: releaseRecipeInventoryAction
    };

    setPendingSave(true);
    try {
      const result = await actionMap[action](recipeId);
      setSaveResult({
        ok: result.ok,
        message: result.message
      });
      setSaveResultSignature(currentSignature);

      if (result.coverage) {
        setStockCoverage(result.coverage);
        return result.ok;
      }

      const refreshed = await getRecipeStockCoverageAction(recipeId);
      if (refreshed.coverage) {
        setStockCoverage(refreshed.coverage);
      }
      return result.ok;
    } catch {
      setSaveResult({ ok: false, message: "Не удалось выполнить операцию со складом — проверьте соединение." });
      setSaveResultSignature(currentSignature);
      return false;
    } finally {
      setPendingSave(false);
    }
  };

  const handleExportBeerXml = async (): Promise<ImportExportActionResult> => {
    const saveBeforeExportResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeExportResult && !saveBeforeExportResult.ok) {
      return {
        ok: false,
        message: saveBeforeExportResult.message,
        fieldErrors: saveBeforeExportResult.fieldErrors
      };
    }

    const recipeId = saveBeforeExportResult?.recipe?.id ?? activeRecipeId;
    if (!recipeId) {
      return { ok: false, message: "Сначала сохраните рецепт, затем подготовьте экспорт." };
    }

    setPendingSave(true);
    try {
      const result = await exportRecipeBeerXmlAction(recipeId);
      setSaveResult({ ok: result.ok, message: result.message });
      setSaveResultSignature(currentSignature);

      if (result.ok && result.beerXml) {
        setBeerXmlExport(result.beerXml);
      }

      return { ok: result.ok, message: result.message };
    } finally {
      setPendingSave(false);
    }
  };

  const applyImportedRecipe = React.useCallback((recipe: RecipeDetailDto, message: string) => {
    const normalizedState = normalizeEditorPublicationState(recipe.publicationState);
    const nextIngredients = recipe.ingredients.map(toDesignerIngredient);
    const nextProcessMeta = cloneRecipeProcessMeta(recipe.processMeta);
    const nextCalculationMeta = cloneRecipeCalculationMeta(recipe.calculationMeta ?? null);
    const nextWaterPlanMeta = cloneRecipeWaterPlanMeta(recipe.waterPlanMeta ?? null);
    const nextEquipmentProfileSnapshot = cloneEquipmentProfileSnapshot(recipe.equipmentProfileSnapshot ?? null);
    const nextPayload = buildEditorPayloadFromRecipe(recipe, nextIngredients);
    const nextSignature = JSON.stringify(nextPayload);

    setActiveRecipeId(recipe.id);
    setActiveRecipeSlug(recipe.slug);
    setActiveVersionNumber(recipe.versionNumber);
    setRecipeVersions(recipe.versions);
    setTitle(recipe.title);
    setStyleId(recipe.styleId ?? "");
    setDescription(recipe.description ?? "");
    setAuthorNotes(recipe.authorNotes ?? "");
    setPublicationState(normalizedState);
    setSavedPublicationState(normalizedState);
    setBatchSize({
      quantity: String(recipe.batchSizeEnteredQuantity),
      unit: recipe.batchSizeEnteredUnit
    });
    setEfficiency(recipe.efficiency != null ? String(recipe.efficiency) : "");
    setBoilTimeMinutes(String(recipe.boilTimeMinutes));
    setProcessMeta(nextProcessMeta);
    setCalculationMeta(nextCalculationMeta);
    setWaterPlanMeta(nextWaterPlanMeta);
    setEquipmentProfileId(recipe.equipmentProfileId ?? null);
    setEquipmentProfileSnapshot(nextEquipmentProfileSnapshot);
    setIngredients(nextIngredients);
    setStockCoverage(null);
    setPreview(buildInitialPreview(recipe));
    setPreviewError(null);
    setBlockedSignature(null);
    setSavedSignature(nextSignature);
    setSavedBatchVolumeL(getBatchVolumeLiters(String(recipe.batchSizeEnteredQuantity), recipe.batchSizeEnteredUnit));
    setSaveResult({ ok: true, message });
    setSaveResultSignature(nextSignature);
    setOpenEditor(null);
    setImportExportOpen(false);
    onRecipeCreated?.(recipe);
    replaceRecipeEditorUrl(recipe.id);
  }, [onRecipeCreated]);

  const handleImportBeerXml = async (): Promise<RecipeEditorResult> => {
    const beerXml = beerXmlImport.trim();
    if (!beerXml) {
      return { ok: false, message: "Вставьте BeerXML или загрузите файл перед импортом." };
    }

    setPendingSave(true);
    try {
      const result = await importBeerXmlRecipeAction(beerXml);

      if (!result.ok || !result.recipe) {
        setSaveResult(result);
        setSaveResultSignature(currentSignature);
        return result;
      }

      applyImportedRecipe(result.recipe, result.message);

      return result;
    } finally {
      setPendingSave(false);
    }
  };

  const handleImportBrewfatherJson = async (): Promise<RecipeEditorResult> => {
    const json = brewfatherJsonImport.trim();
    if (!json) {
      return { ok: false, message: "Вставьте Brewfather JSON или загрузите файл перед импортом." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(json);
    } catch {
      const result = { ok: false, message: "Brewfather JSON не удалось прочитать: проверьте синтаксис файла." };
      setSaveResult(result);
      setSaveResultSignature(currentSignature);
      return result;
    }

    setPendingSave(true);
    try {
      const result = await importBrewfatherJsonRecipeAction(parsed);

      if (!result.ok || !result.recipe) {
        setSaveResult(result);
        setSaveResultSignature(currentSignature);
        return result;
      }

      applyImportedRecipe(result.recipe, result.message);

      return result;
    } finally {
      setPendingSave(false);
    }
  };

  // Единый вход «Сварить»: гарантирует сохранённый рецепт, затем открывает
  // BrewPickerDialog — сам диалог создаёт партию и запускает варку одним из
  // двух режимов («Сварить самому» / «Сварить на автоматике»). recipe-designer
  // отвечает только за то, что рецепт уже сохранён (recipeId существует).
  const handleOpenBrewPicker = async () => {
    const saveBeforeBrewResult = await persistRecipe({ surfaceInlineResult: true });
    if (saveBeforeBrewResult && !saveBeforeBrewResult.ok) {
      return;
    }

    const recipeId = saveBeforeBrewResult?.recipe?.id ?? activeRecipeId;
    if (!recipeId) {
      setSaveResult({ ok: false, message: "Сначала сохраните рецепт, затем начните варку." });
      setSaveResultSignature(currentSignature);
      return;
    }

    setBrewPickerRecipeId(recipeId);
    setBrewPickerOpen(true);
  };

  const handleRecipeCreatedFromImages = React.useCallback((recipe: RecipeDetailDto) => {
    const normalizedState = normalizeEditorPublicationState(recipe.publicationState);

    setActiveRecipeId(recipe.id);
    setActiveRecipeSlug(recipe.slug);
    setActiveVersionNumber(recipe.versionNumber);
    setRecipeVersions(recipe.versions);
    setSavedPublicationState(normalizedState);

    if (!title.trim()) {
      setTitle(recipe.title);
    }

    onRecipeCreated?.(recipe);
    replaceRecipeEditorUrl(recipe.id);
  }, [onRecipeCreated, title]);

  const headerSaveStatusMeta: { label: string; icon: React.ReactNode; className: string } = saveStatus === "saving"
    ? {
      label: "Сохранение…",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      className: "bg-blue-50 text-blue-700 ring-blue-200"
    }
    : saveStatus === "error"
      ? {
        label: "Ошибка сохранения",
        icon: <CircleAlert className="h-3.5 w-3.5" />,
        className: "bg-rose-50 text-rose-700 ring-rose-200"
      }
      : {
        label: "Сохранено",
        icon: <CircleCheck className="h-3.5 w-3.5" />,
        className: "bg-emerald-50 text-emerald-700 ring-emerald-200"
      };

  const visibilityChipMeta = savedVisibility === "published"
    ? { label: "Опубликован", icon: <Globe className="h-3.5 w-3.5" />, className: "bg-violet-50 text-violet-700 ring-violet-200" }
    : { label: "Приватный", icon: <Lock className="h-3.5 w-3.5" />, className: "bg-zinc-100 text-zinc-700 ring-zinc-200" };

  // Компактные ключевые метрики для закреплённой полосы — петля «изменил → увидел»
  // не должна теряться при прокрутке длинной формы (#18/#20).
  const headerStyle = getBeerStyleById(styleId.trim() || "");
  // Диапазон КП рядом с точечной оценкой (#16/17) — та же пара границ, что и в
  // FgSettingsPopover, только компактно свёрнутая в один хвост "(мин–макс)".
  const headerFgRange = formatGravityRange(
    preview?.fgEstimateDetails?.fgRangeMin ?? null,
    preview?.fgEstimateDetails?.fgRangeMax ?? null,
    preferredGravityUnit
  );
  const headerMetrics: Array<{ label: string; value: string; range?: string | null }> = [
    { label: "НП", value: formatGravity(preview?.og ?? null, preferredGravityUnit) },
    { label: "КП", value: formatGravity(preview?.fg ?? null, preferredGravityUnit), range: headerFgRange },
    { label: "ABV", value: preview?.abv != null ? `${preview.abv.toFixed(1)}%` : "—" },
    { label: "IBU", value: preview?.ibu != null ? preview.ibu.toFixed(0) : "—" },
    { label: "SRM", value: preview?.color != null ? preview.color.toFixed(1) : "—" }
  ];

  return (
    <div className="space-y-5">
      <ConfirmActionDialog
        open={waterResetConfirmOpen}
        title="Сбросить настройку воды?"
        description="Сбросятся источник, цель, объёмы, соли и pH. Действие нельзя отменить."
        confirmLabel="Сбросить"
        cancelLabel="Отмена"
        onConfirm={() => {
          resetWaterSetup();
          setWaterResetConfirmOpen(false);
        }}
        onClose={() => setWaterResetConfirmOpen(false)}
      />

      <div className="sticky top-14 z-30 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-zinc-200/70 bg-white/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-white/70 sm:px-5 lg:top-0">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${headerSaveStatusMeta.className}`}>
          {headerSaveStatusMeta.icon}
          <span className="hidden sm:inline">{headerSaveStatusMeta.label}</span>
        </span>

        <dl
          aria-busy={recalculating}
          className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] tabular-nums text-zinc-600 transition-opacity ${recalculating || previewError ? "opacity-50" : ""}`}
        >
          {headerMetrics.map((metric) => (
            <div key={metric.label} className="flex items-baseline gap-1">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-zinc-400">{metric.label}</dt>
              <dd className="font-semibold text-zinc-800">
                {metric.value}
                {metric.range ? <span className="ml-1 font-normal text-zinc-400">({metric.range})</span> : null}
              </dd>
            </div>
          ))}
          {headerStyle ? (
            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-600 ring-1 ring-inset ring-zinc-200">
              {headerStyle.name}
            </span>
          ) : null}
        </dl>

        <div className="ml-auto flex items-center gap-1.5">
          {canManagePublication && savedVisibility === "published" && activeRecipeSlug ? (
            <a
              href={`/recipes/${activeRecipeSlug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 sm:text-sm"
              title="Открыть публичную страницу"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Публичная</span>
            </a>
          ) : null}
          {canManagePublication && savedVisibility === "private" ? (
            <button
              type="button"
              onClick={handlePublishClick}
              disabled={pendingSave}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-900 bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
            >
              <Globe className="h-3.5 w-3.5" />
              Опубликовать
            </button>
          ) : null}
          {canManagePublication && savedVisibility === "published" ? (
            <button
              type="button"
              onClick={() => {
                setMakePrivateError(null);
                setMakePrivateConfirmOpen(true);
              }}
              disabled={pendingSave}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            >
              <Lock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">В&nbsp;приватные</span>
              <span className="sm:hidden">Приватный</span>
            </button>
          ) : null}
          <RecipeActionsMenu
            pending={pendingSave}
            onOpenImportExport={() => setImportExportOpen(true)}
            onOpenBrew={() => void handleOpenBrewPicker()}
          />
        </div>
      </div>

      <section className="-mx-4 border-b border-zinc-200/70 bg-gradient-to-b from-white via-white to-zinc-50/50 px-4 py-4 sm:rounded-2xl sm:border sm:border-zinc-100 sm:bg-white sm:px-5 sm:py-5 sm:shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${visibilityChipMeta.className}`}>
            {visibilityChipMeta.icon}
            {visibilityChipMeta.label}
          </span>
          {activeRecipeId ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-zinc-700 ring-1 ring-inset ring-zinc-200">
              v{activeVersionNumber}
              <span className="text-zinc-400">• текущая</span>
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)] md:items-start">
          <div className="min-w-0">
            <label htmlFor="recipe-title" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-zinc-500">
              Название рецепта
            </label>
            <input
              id="recipe-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 w-full min-w-0 rounded-xl border border-zinc-200 bg-white px-3.5 text-base font-semibold text-zinc-900 shadow-sm placeholder:font-normal placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-200 sm:text-lg"
              placeholder="Например, Tropical NEIPA"
            />
            {sectionErrors.title ? <p className="mt-1 text-xs text-rose-600">{sectionErrors.title}</p> : null}
          </div>
          <div className="min-w-0">
            <StylePicker id="recipe-style" value={styleId} onChange={setStyleId} className="min-w-0" />
            {sectionErrors.styleId ? <p className="mt-1 text-xs text-rose-600">{sectionErrors.styleId}</p> : null}
          </div>
        </div>

        {activeRecipeId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3 text-xs text-zinc-600">
            {recipeVersions.length > 1 ? (
              <label className="inline-flex items-center gap-1.5">
                <span className="text-zinc-500">Версия:</span>
                <select
                  value={activeRecipeId}
                  onChange={(event) => void handleVersionChange(event.target.value)}
                  className="h-8 min-w-[96px] rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 focus:border-zinc-400 focus:outline-none focus:ring-1 focus:ring-zinc-200"
                >
                  {recipeVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {`v${version.versionNumber}${version.id === activeRecipeId ? " • current" : ""}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="text-xs text-zinc-500">v{activeVersionNumber}</span>
            )}
            <button
              type="button"
              onClick={() => void handleCreateVersion()}
              disabled={pendingSave}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Новая версия
            </button>
          </div>
        ) : null}

        {visibleSaveResult && !visibleSaveResult.ok ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-inset ring-rose-200">
            <CircleAlert className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{visibleSaveResult.message}</span>
            {hasRetriableSaveError ? (
              <button
                type="button"
                onClick={() => void persistRecipe()}
                disabled={pendingSave}
                className="shrink-0 font-medium text-rose-700 underline decoration-rose-300 underline-offset-2 transition-colors hover:text-rose-900 disabled:opacity-60"
              >
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <RecipeBatchParametersBlock
          batchSize={batchSize}
          setBatchSize={setBatchSize}
          efficiency={efficiency}
          setEfficiency={setEfficiency}
          boilTimeMinutes={boilTimeMinutes}
          setBoilTimeMinutes={setBoilTimeMinutes}
          styleId={styleId.trim() || null}
          calculationMeta={calculationMeta}
          setCalculationMeta={setCalculationMeta}
          sectionErrors={sectionErrors}
          preview={preview}
          recalculating={recalculating}
          previewError={previewError}
          equipmentProfiles={equipmentProfiles}
          selectedEquipmentProfileId={equipmentProfileId}
          onSelectEquipmentProfile={handleSelectEquipmentProfile}
          canRescaleToVolume={canRescaleToVolume}
          onRescaleToVolume={handleRescaleToVolume}
          onOpenBitternessSettings={() => setBitternessSettingsOpen(true)}
          preferredGravityUnit={preferredGravityUnit}
        />
        <RecipeStyleStatsBlock
          preview={preview}
          recalculating={recalculating}
          previewError={previewError}
          preferredGravityUnit={preferredGravityUnit}
        />
      </section>

      <div className="space-y-4">
        {sectionDefinitions.map((section) => {
          const IconComponent = categoryIcons[section.category];
          const iconBg = categoryIconBg[section.category];
          const itemCount = section.items.length;
          const hasError = Boolean(sectionErrors[`ingredients.${section.category}`]);
          const isWaterTreatmentSection = section.category === "water_treatment";
          const canAddToSection =
            section.category !== "hop" && !isWaterTreatmentSection;
          return (
            <section key={section.category} className={`overflow-hidden rounded-2xl border ${hasError ? "border-rose-200" : "border-zinc-200/70"} bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]`}>
              <header className="flex items-center justify-between gap-3 border-b border-zinc-100 bg-zinc-50/40 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                    <IconComponent className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h2 className="truncate text-base font-semibold text-zinc-950">{section.title}</h2>
                      {section.subtitle ? <span className="text-sm tabular-nums text-zinc-400">({section.subtitle})</span> : null}
                    </div>
                    {hasError ? <p className="mt-0.5 text-xs text-rose-700">{sectionErrors[`ingredients.${section.category}`]}</p> : null}
                  </div>
                </div>
                {section.category !== "hop" ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isWaterTreatmentSection ? (
                      <>
                        <button
                          type="button"
                          onClick={waterSetupOpen ? closeWaterSetup : openWaterSetup}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900 sm:h-9 sm:px-3 sm:text-sm"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          <span className="hidden sm:inline">
                            {getRecipeWaterSetupToggleLabel(waterSetupOpen)}
                          </span>
                          <span className="sm:hidden">
                            {waterSetupOpen ? "Скрыть" : "Вода"}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setWaterResetConfirmOpen(true)}
                          disabled={!waterPlanMeta.setupEnabled}
                          className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-500 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:px-3 sm:text-sm"
                        >
                          <span className="hidden sm:inline">Сбросить воду</span>
                          <span className="sm:hidden">Сброс</span>
                        </button>
                      </>
                    ) : null}
                    {canAddToSection ? (
                      <button
                        type="button"
                        onClick={() => openAddEditor(section.category)}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 sm:h-9 sm:px-3 sm:text-sm"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span className="hidden sm:inline">
                          Добавить
                        </span>
                        <span className="sm:hidden">
                          Добавить
                        </span>
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </header>

              <div className="p-3 sm:p-4">
                {section.renderItems ? (
                  section.renderItems(section.items)
                ) : section.items.length ? (
                  <ul className="space-y-2">
                    {section.items.map((ingredient) => (
                      <SectionRow
                        key={ingredient.localId}
                        ingredient={ingredient}
                        percentage={section.category === "fermentable" ? getFermentablePercentage(ingredient, fermentableTotalKg) : null}
                        onEdit={(value) => maybeOpenEditor({
                          localId: value.localId,
                          category: value.category,
                          draft: { ...value },
                          initialSignature: serializeIngredient(value),
                          isExisting: true
                        })}
                        onDelete={deleteIngredient}
                        onQuantityChange={updateIngredientQuantity}
                        onTimeChange={updateHopTimeMinutes}
                        onAddImportedAsCustom={addImportedIngredientAsCustom}
                        onMapImportedSource={openImportedCatalogMatcher}
                      />
                    ))}
                  </ul>
                ) : (
                  <button
                    type="button"
                    onClick={() => section.category !== "hop" ? openAddEditor(section.category) : undefined}
                    disabled={section.category === "hop"}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 bg-zinc-50/40 px-4 py-6 text-sm text-zinc-500 transition-colors hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-700 disabled:cursor-default disabled:hover:border-zinc-300 disabled:hover:bg-zinc-50/40 disabled:hover:text-zinc-500"
                  >
                    {section.category !== "hop" ? <Plus className="h-4 w-4" /> : null}
                    <span>{section.empty}</span>
                  </button>
                )}
              </div>
            </section>
          );
        })}
      </div>

      <div className="space-y-2">
        <RecipeProfiles processMeta={processMeta} onChange={setProcessMeta} />
        {sectionErrors["processMeta.mashProfile.steps"] ? (
          <p className="text-xs text-rose-700">{sectionErrors["processMeta.mashProfile.steps"]}</p>
        ) : null}
        {sectionErrors["processMeta.fermentationProfile"] ? (
          <p className="text-xs text-rose-700">{sectionErrors["processMeta.fermentationProfile"]}</p>
        ) : null}
      </div>

      <StockCoverageSummary
        coverage={stockCoverage}
        pending={pendingSave}
        activeRecipeId={activeRecipeId}
        onAction={(action) => {
          // Списание — необратимая складская операция, поэтому идёт через диалог
          // с построчной сводкой (#8/#9); остальные действия (обновить/резерв/снять
          // резерв) остаются одним кликом, как и раньше.
          if (action === "consume") {
            setStockConsumeDialogOpen(true);
            return;
          }
          void runInventoryAction(action);
        }}
      />

      <StockConsumeDialog
        open={stockConsumeDialogOpen}
        coverage={stockCoverage}
        pending={pendingSave}
        message={visibleSaveResult && !visibleSaveResult.ok ? visibleSaveResult.message : null}
        onConfirm={() => {
          void runInventoryAction("consume").then((ok) => {
            if (ok) {
              setStockConsumeDialogOpen(false);
            }
          });
        }}
        onClose={() => setStockConsumeDialogOpen(false)}
      />

      <section className="space-y-4">
        <RecipeImagesSection
          recipeId={activeRecipeId}
          recipeTitle={title}
          initialImages={initialImages}
          draftSeed={payload}
          onRecipeCreated={handleRecipeCreatedFromImages}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <details className="group overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]" open>
            <summary className="flex cursor-pointer list-none items-center gap-2.5 border-b border-transparent bg-zinc-50/40 px-4 py-3 text-sm font-semibold text-zinc-800 group-open:border-zinc-100">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-[15px]">Описание рецепта</span>
              <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">публично</span>
              <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="p-4">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-200"
                placeholder="Публичное описание рецепта — что это за пиво, вдохновение, особенности…"
              />
              {sectionErrors.description ? <p className="mt-2 text-xs text-rose-700">{sectionErrors.description}</p> : null}
            </div>
          </details>
          <details className="group overflow-hidden rounded-2xl border border-zinc-200/70 bg-white shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]" open>
            <summary className="flex cursor-pointer list-none items-center gap-2.5 border-b border-transparent bg-zinc-50/40 px-4 py-3 text-sm font-semibold text-zinc-800 group-open:border-zinc-100">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <StickyNote className="h-4 w-4" />
              </div>
              <span className="text-[15px]">Личные заметки</span>
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">
                <Lock className="h-3 w-3" />
                приватно
              </span>
              <ChevronRight className="ml-auto h-4 w-4 text-zinc-400 transition-transform group-open:rotate-90" />
            </summary>
            <div className="p-4">
              <textarea
                value={authorNotes}
                onChange={(event) => setAuthorNotes(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-zinc-200 bg-zinc-50/50 px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-zinc-200"
                placeholder="Видны только вам — TODO, лоты, наблюдения с прошлых варок…"
              />
            </div>
          </details>
        </div>
      </section>

      <ConfirmActionDialog
        open={publishConfirmOpen}
        title="Опубликовать рецепт?"
        description="После публикации он станет доступен по публичной ссылке."
        confirmLabel="Опубликовать"
        pendingLabel="Публикуем..."
        tone="primary"
        pending={pendingSave}
        error={publishError}
        onConfirm={() => void handlePublishConfirm()}
        onClose={() => {
          setPublishConfirmOpen(false);
          setPublishError(null);
        }}
      />

      <ConfirmActionDialog
        open={makePrivateConfirmOpen}
        title="Сделать рецепт приватным?"
        description="После этого публичная страница перестанет быть доступна."
        confirmLabel="Сделать приватным"
        pendingLabel="Меняем доступ..."
        pending={pendingSave}
        error={makePrivateError}
        onConfirm={() => void handleMakePrivateConfirm()}
        onClose={() => {
          setMakePrivateConfirmOpen(false);
          setMakePrivateError(null);
        }}
      />

      <PublicationReadinessDialog
        open={readinessDialogOpen}
        checklist={publishChecklist}
        onClose={() => setReadinessDialogOpen(false)}
      />

      <BitternessSettingsDrawer
        open={bitternessSettingsOpen}
        calculationMeta={calculationMeta}
        onChange={setCalculationMeta}
        onClose={() => setBitternessSettingsOpen(false)}
      />

      <ImportExportModal
        open={importExportOpen}
        pending={pendingSave}
        activeRecipeId={activeRecipeId}
        beerXmlExport={beerXmlExport}
        beerXmlImport={beerXmlImport}
        brewfatherJsonImport={brewfatherJsonImport}
        onBeerXmlImportChange={setBeerXmlImport}
        onBrewfatherJsonImportChange={setBrewfatherJsonImport}
        onExportBeerXml={handleExportBeerXml}
        onImportBeerXml={handleImportBeerXml}
        onImportBrewfatherJson={handleImportBrewfatherJson}
        onClose={() => setImportExportOpen(false)}
      />

      {brewPickerRecipeId ? (
        <BrewPickerDialog
          open={brewPickerOpen}
          onOpenChange={setBrewPickerOpen}
          recipeId={brewPickerRecipeId}
          recipeTitle={title}
        />
      ) : null}

      <IngredientAddDrawer open={Boolean(openEditor)} onClose={() => closeEditor()}>
        {editorPanel}
      </IngredientAddDrawer>
    </div>
  );
}
