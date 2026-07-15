"use client";

import { getBeerStyleById, getBjcpStyleDisplayName } from "@nb/brewing-core";
import { useToast } from "@nb/ui";
import {
  CircleCheck,
  CircleAlert,
  CircleDashed,
  ChevronRight,
  ExternalLink,
  FileText,
  Globe,
  Loader2,
  Lock,
  Plus,
  SlidersHorizontal,
  StickyNote,
  X
} from "lucide-react";
import React, { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import {
  createRecipeCustomIngredientAction,
  createRecipeVersionAction,
  deleteRecipeAction,
  exportRecipeBeerXmlAction,
  importBeerXmlRecipeAction,
  importBrewfatherJsonRecipeAction,
  previewRecipeDraftAction,
  type RecipeEditorPayload,
  type RecipeEditorResult
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
  type RecipePublicationState
} from "@/features/recipes/contracts";
import { formatGravity, formatGravityRange, formatGravitySecondary, type PreferredGravityUnit } from "@/features/system/gravity-units";
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
  buildRecipeDeleteConfirmDescription,
  buildStatsDivergence,
  replaceRecipeEditorUrl,
  hopUseTypeLabels,
  hopUseTypeSectionLabels,
  recipeHopUseTypeUiOrder,
  recipeAdditionalHopUseTypeUiOrder,
  cloneRecipeProcessMeta,
  cloneRecipeCalculationMeta,
  cloneRecipeWaterPlanMeta,
  buildEquipmentProfileSnapshotFromDto,
  resolveInitialEquipmentState,
  resolveAutoSelectedEquipmentProfileId,
  nextEquipmentProfileFocusPoll,
  formatEquipmentProfileRecipeValue,
  DEFAULT_BOIL_TIME_MINUTES,
  DEFAULT_EFFICIENCY,
  normalizeSavePayload,
  normalizeEditorPublicationState,
  applySelection,
  serializeIngredient,
  getHopUseType,
  buildIngredientPayload,
  toDesignerIngredient,
  buildInitialPreview,
  buildEditorPayloadFromRecipe,
  createLocalId,
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
  type DesignerIngredient
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
  initialStyleId?: string;
  initialIngredientSelection?: IngredientSuggestionItem | null;
  initialImages?: RecipeImageDto[];
  equipmentProfiles?: EquipmentProfileDto[];
  /** Сколько партий пользователь сварил по этому рецепту — их судьбу называет подтверждение удаления. */
  brewBatchCount?: number;
  onSaveStatusChange?: (status: RecipeSaveStatus) => void;
  onRecipeCreated?: (recipe: RecipeDetailDto) => void;
  onPublicationStateChange?: (state: RecipePublicationState) => void;
  preferredGravityUnit: PreferredGravityUnit;
};

export type { RecipeSaveStatus };

// Ф5 (P1+P1+P2 ревью волны 4): окно дедупа focus/visibilitychange на возврат в таб
// после клика «+ Создать профиль…» — оба события стреляют на одном и том же возврате.
const EQUIPMENT_PROFILE_FOCUS_DEDUPE_MS = 1000;

export function RecipeDesigner({
  mode,
  initialRecipe,
  initialTitle,
  initialStyleId,
  initialIngredientSelection = null,
  initialImages = [],
  equipmentProfiles = [],
  brewBatchCount = 0,
  onSaveStatusChange,
  onRecipeCreated,
  onPublicationStateChange,
  preferredGravityUnit
}: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const initialDefaultEquipmentProfile = initialRecipe
    ? null
    : equipmentProfiles.find((profile) => profile.isDefault) ?? equipmentProfiles[0] ?? null;
  const [title, setTitle] = useState(initialRecipe?.title ?? initialTitle ?? "");
  const [styleId, setStyleId] = useState(initialRecipe?.styleId ?? initialStyleId ?? "");
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
    : String(initialDefaultEquipmentProfile?.brewhouseEfficiencyPct ?? DEFAULT_EFFICIENCY));
  const [boilTimeMinutes, setBoilTimeMinutes] = useState(initialRecipe?.boilTimeMinutes != null ? String(initialRecipe.boilTimeMinutes) : "60");
  const [processMeta, setProcessMeta] = useState<RecipeProcessMeta>(() => {
    const cloned = cloneRecipeProcessMeta(initialRecipe?.processMeta ?? defaultRecipeProcessMeta);
    // Новый рецепт не должен стартовать с пустого Mash Profile «(0)» —
    // подкладываем один осмысленный шаг затирания по умолчанию. Режим
    // редактирования существующего рецепта не трогаем.
    if (!initialRecipe && cloned.mashProfile.steps.length === 0) {
      cloned.mashProfile.steps.push({
        id: createLocalId(),
        name: "Шаг 1",
        temperatureC: 66,
        durationMinutes: 60
      });
    }
    return cloned;
  });
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
  const [equipmentProfileId, setEquipmentProfileId] = useState<string | null>(() => (
    initialRecipe
      ? resolveInitialEquipmentState(initialRecipe, equipmentProfiles).profileId
      : initialDefaultEquipmentProfile?.id ?? null
  ));
  const [equipmentProfileSnapshot, setEquipmentProfileSnapshot] = useState<EquipmentProfileSnapshot | null>(() => (
    initialRecipe
      ? resolveInitialEquipmentState(initialRecipe, equipmentProfiles).snapshot
      : (initialDefaultEquipmentProfile ? buildEquipmentProfileSnapshotFromDto(initialDefaultEquipmentProfile) : null)
  ));
  // Профиль оборудования принадлежит автору оригинала (копия чужого/публичного
  // рецепта) — снапшот унаследован из рецепта, а не собран из СВОЕГО профиля.
  // Селект тогда честно показывает «Оборудование автора рецепта» вместо вранья
  // «Без профиля» (Ф1). Сбрасывается при явном выборе своего профиля/«Без профиля»
  // и не восстанавливается — до перезагрузки страницы, это ок для первой итерации.
  const [isInheritedEquipmentSnapshot, setIsInheritedEquipmentSnapshot] = useState<boolean>(() => (
    initialRecipe ? resolveInitialEquipmentState(initialRecipe, equipmentProfiles).isInheritedSnapshot : false
  ));
  // Вызываем useToast до useRecipeIngredients: колбэк onIngredientDeleted,
  // передаваемый в хук ниже, использует `show`.
  const { show } = useToast();
  // restoreIngredient возвращается тем же вызовом useRecipeIngredients, которому
  // передаётся onIngredientDeleted — колбэк не может сослаться на неё напрямую.
  // Держим последнюю версию в ref и читаем её из onClick тоста (клик всегда
  // происходит уже после коммита хука, ref к этому моменту актуален).
  const restoreIngredientRef = useRef<(ingredient: DesignerIngredient, index: number) => void>(() => {});
  // Время кипячения рецепта числом — им предзаполняется поле «мин» у хмеля на
  // кипячение (и его же подставляет расчёт IBU, если поле оставить пустым).
  const effectiveBoilTimeMinutes = Number(boilTimeMinutes) || DEFAULT_BOIL_TIME_MINUTES;
  const {
    ingredients,
    setIngredients,
    openEditor,
    setOpenEditor,
    maybeOpenEditor,
    closeConfirmOpen,
    requestCloseEditor,
    confirmCloseEditor,
    cancelCloseEditor,
    openAddEditor,
    deleteIngredient,
    restoreIngredient,
    openImportedCatalogMatcher,
    updateIngredientQuantity,
    updateHopTimeMinutes
  } = useRecipeIngredients({
    initialRecipe,
    initialIngredientSelection,
    boilTimeMinutes: effectiveBoilTimeMinutes,
    onIngredientDeleted: ({ ingredient, index }) => {
      show({
        title: "Позиция удалена",
        description: ingredient.selectedName || undefined,
        action: {
          label: "Вернуть",
          onClick: () => restoreIngredientRef.current(ingredient, index)
        }
      });
    }
  });

  useEffect(() => {
    restoreIngredientRef.current = restoreIngredient;
  }, [restoreIngredient]);
  const [beerXmlExport, setBeerXmlExport] = useState("");
  const [beerXmlImport, setBeerXmlImport] = useState("");
  const [brewfatherJsonImport, setBrewfatherJsonImport] = useState("");
  const [preview, setPreview] = useState<RecipeDraftPreviewDto | null>(buildInitialPreview(initialRecipe));
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Плашка «показатели автора отличаются от расчёта» (Ф1) — закрывается крестиком
  // на сессию компонента, не на рецепт: следующее открытие редактора её снова покажет.
  const [statsDivergenceDismissed, setStatsDivergenceDismissed] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [bitternessSettingsOpen, setBitternessSettingsOpen] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
  // Объём, под который набраны текущие количества ингредиентов — база для действия
  // «Пересчитать ингредиенты под N л». Сдвигается только когда количества и объём
  // снова сходятся: сам пересчёт, загрузка рецепта (версия/импорт), пустой список
  // ингредиентов. Автосейв её НЕ трогает — раньше база равнялась объёму последнего
  // сохранения, и действие исчезало через 1.5 с после смены объёма, так и не дав
  // по себе кликнуть (профиль оборудования меняет объём — действие мигало и гасло).
  const [scaleBaseVolumeL, setScaleBaseVolumeL] = useState<number | null>(
    () => getBatchVolumeLiters(batchSize.quantity, batchSize.unit)
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
    setSaveResult,
    setSaveResultSignature,
    setBlockedSignature,
    pendingSave,
    setPendingSave,
    setSavedSignature,
    isDirty,
    isDraftWorthPersisting,
    saveStatus,
    visibleSaveResult,
    hasRetriableSaveError,
    persistRecipe,
    markDeleted,
    restoreAfterFailedDelete
  } = useRecipeAutosave({
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

      // Позиция не резолвится в известную соль водного плана (кастом со склада,
      // немаппящийся каталожный id, неконвертируемая единица) — легаси-путь:
      // добавляем обычной позицией рецепта, она уже корректно отрисовывается
      // через WaterTreatmentSectionRow и попадает в payload.
      setIngredients((current) => [...current, openEditor.draft]);
      setOpenEditor(null);
      return;
    }

    if (openEditor.localId) {
      setIngredients((current) => current.map((ingredient) => ingredient.localId === openEditor.localId ? openEditor.draft : ingredient));
    } else {
      setIngredients((current) => [...current, openEditor.draft]);
    }

    // brew-day.ts (гид варки) читает целевую температуру брожения только из
    // processMeta.fermentationProfile.primaryTemperatureC — stepMeta.fermentationTempC
    // дрожжей сам по себе никуда не попадает, синкаем при сохранении позиции.
    if (openEditor.category === "yeast") {
      const fermentationTempCInput = openEditor.draft.stepMeta.fermentationTempC ?? "";
      const fermentationTempC = Number(fermentationTempCInput.trim());
      if (fermentationTempCInput.trim() && Number.isFinite(fermentationTempC)) {
        setProcessMeta((current) => ({
          ...current,
          fermentationProfile: {
            ...current.fermentationProfile,
            primaryTemperatureC: fermentationTempC
          }
        }));
      }
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

  const applyEquipmentProfileSelection = React.useCallback((profileId: string | null) => {
    if (!profileId) {
      setEquipmentProfileId(null);
      setEquipmentProfileSnapshot(null);
      setIsInheritedEquipmentSnapshot(false);
      return;
    }

    const profile = equipmentProfiles.find((item) => item.id === profileId);
    if (!profile) {
      return;
    }

    setEquipmentProfileId(profile.id);
    setEquipmentProfileSnapshot(buildEquipmentProfileSnapshotFromDto(profile));
    setIsInheritedEquipmentSnapshot(false);
    setBatchSize((current) => ({
      ...current,
      quantity: formatEquipmentProfileRecipeValue(profile.targetBatchVolumeL)
    }));
    setEfficiency(formatEquipmentProfileRecipeValue(profile.brewhouseEfficiencyPct));
  }, [equipmentProfiles]);

  // Ф11: «+ Создать профиль…» открывает /app/equipment?mode=create в НОВОЙ вкладке
  // (SPA-переход в этой же молча стёр бы последние правки — автосейв дебаунсит 1.5 с).
  // Флаг в ref включает опрос возврата фокуса только после реального клика — иначе
  // пришлось бы дёргать router.refresh() на каждый фокус вкладки всю сессию редактора.
  const equipmentProfileCreateRequestedRef = useRef(false);
  const equipmentProfileIdsSnapshotRef = useRef<string[] | null>(null);
  // Ф5 (P1+P1+P2 ревью волны 4): счётчик опросов на клик (лимит — не держать
  // router.refresh() до конца сессии, если профиль так и не создали) и
  // guard-таймстамп дедупа focus/visibilitychange (оба стреляют на одном
  // возврате в таб — без guard'а это двойной refresh и двойной декремент).
  const equipmentProfileFocusPollCountRef = useRef(0);
  const equipmentProfileLastFocusEventAtRef = useRef(0);

  // Ручной выбор в селекте (не автовыбор ниже) — источник истины для пользователя:
  // безусловно снимает ожидание нового профиля, иначе более поздний автовыбор или
  // истечение лимита опросов могли бы молча перетереть то, что выбрали руками.
  const handleSelectEquipmentProfile = React.useCallback((profileId: string | null) => {
    applyEquipmentProfileSelection(profileId);
    equipmentProfileCreateRequestedRef.current = false;
    equipmentProfileIdsSnapshotRef.current = null;
    equipmentProfileFocusPollCountRef.current = 0;
  }, [applyEquipmentProfileSelection]);

  const handleCreateEquipmentProfile = React.useCallback(() => {
    equipmentProfileCreateRequestedRef.current = true;
    equipmentProfileIdsSnapshotRef.current = equipmentProfiles.map((profile) => profile.id);
    equipmentProfileFocusPollCountRef.current = 0;
    equipmentProfileLastFocusEventAtRef.current = 0;
    window.open("/app/equipment?mode=create", "_blank");
  }, [equipmentProfiles]);

  useEffect(() => {
    const handleFocusReturn = () => {
      if (!equipmentProfileCreateRequestedRef.current) return;

      const now = Date.now();
      if (now - equipmentProfileLastFocusEventAtRef.current < EQUIPMENT_PROFILE_FOCUS_DEDUPE_MS) {
        // Второе событие того же возврата фокуса (focus + visibilitychange) — пропускаем.
        return;
      }
      equipmentProfileLastFocusEventAtRef.current = now;

      const { pollCount, shouldRefresh } = nextEquipmentProfileFocusPoll(equipmentProfileFocusPollCountRef.current);
      equipmentProfileFocusPollCountRef.current = pollCount;

      if (!shouldRefresh) {
        // Лимит опросов исчерпан — профиль, видимо, не создали. Флаг снимается сам,
        // иначе следующий случайный новый профиль (через час, в другом табе) подхватился бы автоматически.
        equipmentProfileCreateRequestedRef.current = false;
        equipmentProfileIdsSnapshotRef.current = null;
        return;
      }

      router.refresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        handleFocusReturn();
      }
    };
    window.addEventListener("focus", handleFocusReturn);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("focus", handleFocusReturn);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [router]);

  // equipmentProfiles реактивен к router.refresh() (проп с сервера, без local-копии,
  // см. RecipeEditorPage → RecipeForm → RecipeDesigner) — как только список отрастил
  // ровно один новый профиль, выбираем его и выключаем опрос фокуса до следующего клика.
  // resolveAutoSelectedEquipmentProfileId сам возвращает null, если флаг ожидания уже
  // снят (ручным выбором или истечением лимита опросов) — тогда автовыбор не трогает
  // текущий выбор пользователя, даже если новый профиль всё-таки появился.
  useEffect(() => {
    const newProfileId = resolveAutoSelectedEquipmentProfileId(
      equipmentProfileCreateRequestedRef.current,
      equipmentProfileIdsSnapshotRef.current,
      equipmentProfiles
    );
    if (!newProfileId) {
      return;
    }

    equipmentProfileCreateRequestedRef.current = false;
    equipmentProfileIdsSnapshotRef.current = null;
    equipmentProfileFocusPollCountRef.current = 0;
    applyEquipmentProfileSelection(newProfileId);
  }, [equipmentProfiles, applyEquipmentProfileSelection]);

  // Пустой рецепт нечего масштабировать: пока ингредиентов нет, база едет за объёмом,
  // чтобы позже не предлагать пересчёт под объём, под который количества и вводились.
  useEffect(() => {
    if (ingredients.length === 0 && batchVolumeL != null && batchVolumeL !== scaleBaseVolumeL) {
      setScaleBaseVolumeL(batchVolumeL);
    }
  }, [batchVolumeL, ingredients.length, scaleBaseVolumeL]);

  // Действие «Пересчитать ингредиенты под N л» (#6): доступно, только когда текущий
  // объём разошёлся с базой (объёмом, под который набраны количества) и в рецепте
  // есть что масштабировать. По умолчанию количества НЕ трогаются — это явное
  // действие, а не побочный эффект ввода объёма или смены профиля оборудования.
  // Масштабирует чистой `scaleRecipeToVolume` (features/recipes/scale.ts) от базы к
  // текущему введённому объёму — не мутирует и не сохраняет сама.
  const canRescaleToVolume = shouldShowRescaleToVolumeAction({
    scaleBaseVolumeL,
    currentBatchVolumeL: batchVolumeL,
    ingredientCount: ingredients.length
  });
  const handleRescaleToVolume = React.useCallback(() => {
    if (scaleBaseVolumeL == null || scaleBaseVolumeL <= 0 || batchVolumeL == null || batchVolumeL <= 0) {
      return;
    }

    const scaleInput = buildDesignerScaleInput(ingredients, scaleBaseVolumeL);
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
    setScaleBaseVolumeL(batchVolumeL);
  }, [batchVolumeL, ingredients, scaleBaseVolumeL]);

  const sectionErrors = visibleSaveResult?.fieldErrors ?? {};
  const publicationValidationContext = {
    title,
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
                    <div className="flex items-center justify-between gap-2 border-b border-border px-1 pb-1.5">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{hopUseTypeSectionLabels[useType]}</h4>
                      {rows.length ? <button type="button" onClick={() => openAddEditor("hop", useType)} className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
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
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-muted hover:text-foreground"
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
                  <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2 text-xs font-semibold text-muted-foreground transition-colors hover:border-border hover:bg-muted hover:text-foreground">
                    <ChevronRight className="h-3.5 w-3.5 transition-transform group-open:rotate-90" />
                    Другие типы охмеления
                  </summary>
                  <div className="mt-2 space-y-3">
                    {unusedTypes.map((useType) => (
                      <div key={useType} className="flex items-center justify-between gap-2 rounded-lg border border-dashed border-border px-3 py-2">
                        <span className="text-xs text-muted-foreground">{hopUseTypeLabels[useType]}</span>
                        <button type="button" onClick={() => openAddEditor("hop", useType)} className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
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
        title: "Специи и добавки",
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
      boilTimeMinutes={effectiveBoilTimeMinutes}
      onChange={(next) => setOpenEditor((current) => current ? { ...current, draft: next } : current)}
      onSave={saveEditor}
      onCancel={() => requestCloseEditor()}
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
      surfaceInlineResult: false,
      force: true
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
      surfaceInlineResult: false,
      force: true
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
    const saveBeforeSwitch = await persistRecipe({ surfaceInlineResult: true, force: true });
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

    const saveBeforeVersionResult = await persistRecipe({ surfaceInlineResult: true, force: true });
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

  // Удаление рецепта прямо из редактора: единственный выход для черновика, который
  // уже создан в БД (иначе пользователю пришлось бы искать его в галерее). markDeleted
  // гасит автосейв — иначе взведённый таймер воскресил бы рецепт после удаления.
  const handleDeleteRecipe = async () => {
    if (!activeRecipeId || deletePending) {
      return;
    }

    setDeletePending(true);
    setDeleteError(null);
    markDeleted();
    try {
      const result = await deleteRecipeAction(activeRecipeId);
      if (!result.ok) {
        restoreAfterFailedDelete();
        setDeleteError(result.message);
        return;
      }

      setDeleteConfirmOpen(false);
      startTransition(() => {
        router.push("/app/recipes");
      });
    } catch {
      restoreAfterFailedDelete();
      setDeleteError("Не удалось удалить рецепт — проверьте соединение.");
    } finally {
      setDeletePending(false);
    }
  };

  const handleExportBeerXml = async (): Promise<ImportExportActionResult> => {
    // Подстраховка инварианта: пустой черновик не должен force-персиститься в БД
    // ради экспорта. Штатно сюда не доходит — ImportExportModal.handleExport
    // гейтит !activeRecipeId раньше (import-export-modal.tsx), но инвариант
    // держим и здесь на случай других вызывающих.
    if (!activeRecipeId && !isDraftWorthPersisting) {
      return { ok: false, message: "Сначала добавьте хотя бы один ингредиент или назовите рецепт." };
    }

    const saveBeforeExportResult = await persistRecipe({ surfaceInlineResult: true, force: true });
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
    const nextEquipmentState = resolveInitialEquipmentState(recipe, equipmentProfiles);
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
    setEquipmentProfileId(nextEquipmentState.profileId);
    setEquipmentProfileSnapshot(nextEquipmentState.snapshot);
    setIsInheritedEquipmentSnapshot(nextEquipmentState.isInheritedSnapshot);
    setIngredients(nextIngredients);
    setPreview(buildInitialPreview(recipe));
    setPreviewError(null);
    setBlockedSignature(null);
    setSavedSignature(nextSignature);
    setScaleBaseVolumeL(getBatchVolumeLiters(String(recipe.batchSizeEnteredQuantity), recipe.batchSizeEnteredUnit));
    setSaveResult({ ok: true, message });
    setSaveResultSignature(nextSignature);
    setOpenEditor(null);
    setImportExportOpen(false);
    onRecipeCreated?.(recipe);
    replaceRecipeEditorUrl(recipe.id);
  }, [equipmentProfiles, onRecipeCreated]);

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
    // Пустой черновик (B2/#13): варить нечего, форсить создание записи в БД
    // ради пустой болванки не нужно — кнопка и так задизейблена (см. ниже), это
    // подстраховка на случай прямого вызова.
    if (!activeRecipeId && !isDraftWorthPersisting) {
      setSaveResult({ ok: false, message: "Сначала добавьте хотя бы один ингредиент или назовите рецепт." });
      setSaveResultSignature(currentSignature);
      return;
    }

    const saveBeforeBrewResult = await persistRecipe({ surfaceInlineResult: true, force: true });
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

  // Ф7: возврат из «Сварить → Подключить BrewForge → Продолжить варку» — баннер на
  // /app/devices ведёт сюда с ?brew=1. Рецепт уже загружен (activeRecipeId есть с
  // маунта в режиме edit) — открываем «Сварить» ровно один раз (handleOpenBrewPicker
  // форс-сейвит черновик, это ок) и стираем параметр, иначе повторный визит на этот
  // же URL/возврат назад переоткрывает диалог.
  const brewAutoOpenHandledRef = useRef(false);
  useEffect(() => {
    if (brewAutoOpenHandledRef.current) return;
    if (searchParams.get("brew") !== "1") return;
    if (!activeRecipeId) return;

    brewAutoOpenHandledRef.current = true;
    void handleOpenBrewPicker();

    const params = new URLSearchParams(searchParams.toString());
    params.delete("brew");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    // handleOpenBrewPicker замыкает состояние текущего рендера — включать его в deps
    // означало бы новый эффект на каждый чих, а ref уже гарантирует ровно один вызов.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRecipeId, pathname, router, searchParams]);

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

  // Записи в БД ещё нет: либо рецепт не набрал порога (B2), либо автосейв ждёт
  // первого изменения (рецепт засеян ингредиентом из каталога). Оба случая — «Не
  // сохранён»: «Черновик» читался бы как «сохранён, но не опубликован» (публикацию
  // показывает соседний чип), а «Сохранение…» — как поломка.
  const isUnsavedDraft = !activeRecipeId;
  // Есть что терять — подсвечиваем чип и даём явную кнопку «Сохранить»: фоновый
  // автосейв в этом состоянии молчит, и уйти со страницы, потеряв настройки, можно
  // только осознанно (уход по ссылке беззвучен, beforeunload ловит лишь закрытие вкладки).
  const hasUnsavedDraftWork = isUnsavedDraft && (isDirty || isDraftWorthPersisting);
  const canSaveDraftNow = hasUnsavedDraftWork && (saveStatus === "draft" || saveStatus === "saved");
  const headerSaveStatusMeta: { label: string; icon: React.ReactNode; className: string } = saveStatus === "saving"
    ? {
      label: "Сохранение…",
      icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,
      className: "bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-500/30"
    }
    : saveStatus === "error"
      ? {
        label: "Ошибка сохранения",
        icon: <CircleAlert className="h-3.5 w-3.5" />,
        className: "bg-destructive-subtle text-destructive-subtle-foreground ring-destructive-border"
      }
      : saveStatus === "draft" || isUnsavedDraft
        ? {
          label: "Не сохранён",
          icon: <CircleDashed className="h-3.5 w-3.5" />,
          className: hasUnsavedDraftWork
            ? "bg-warning-subtle text-warning-subtle-foreground ring-warning/30"
            : "bg-muted text-muted-foreground ring-border"
        }
        : {
          label: "Сохранено",
          icon: <CircleCheck className="h-3.5 w-3.5" />,
          className: "bg-success-subtle text-success-subtle-foreground ring-success/30"
        };

  const deleteRecipeDescription = buildRecipeDeleteConfirmDescription(title, brewBatchCount);

  const visibilityChipMeta = savedVisibility === "published"
    ? { label: "Опубликован", icon: <Globe className="h-3.5 w-3.5" />, className: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30" }
    : { label: "Приватный", icon: <Lock className="h-3.5 w-3.5" />, className: "bg-muted text-foreground ring-border" };

  // Компактные ключевые метрики для закреплённой полосы — петля «изменил → увидел»
  // не должна теряться при прокрутке длинной формы (#18/#20).
  const headerStyle = getBeerStyleById(styleId.trim() || "");
  // Расхождение сохранённых статов (первоисточник у витринных/кураторских рецептов)
  // с client-side превью движка (Ф1) — только для существующего рецепта с непустыми
  // сохранёнными статами; для нового рецепта сравнивать не с чем.
  const statsDivergence = initialRecipe && preview && (
    initialRecipe.og != null || initialRecipe.abv != null || initialRecipe.ibu != null || initialRecipe.color != null
  )
    ? buildStatsDivergence(
      { og: initialRecipe.og, abv: initialRecipe.abv, ibu: initialRecipe.ibu, color: initialRecipe.color },
      { og: preview.og, abv: preview.abv, ibu: preview.ibu, color: preview.color },
      preferredGravityUnit
    )
    : [];
  // Диапазон КП рядом с точечной оценкой (#16/17) — та же пара границ, что и в
  // FgSettingsPopover, только компактно свёрнутая в один хвост "(мин–макс)".
  const headerFgRange = formatGravityRange(
    preview?.fgEstimateDetails?.fgRangeMin ?? null,
    preview?.fgEstimateDetails?.fgRangeMax ?? null,
    preferredGravityUnit
  );
  const headerMetrics: Array<{ label: string; value: string; range?: string | null; secondary?: string | null }> = [
    {
      label: "НП",
      value: formatGravity(preview?.og ?? null, preferredGravityUnit),
      secondary: formatGravitySecondary(preview?.og ?? null, preferredGravityUnit)
    },
    {
      label: "КП",
      value: formatGravity(preview?.fg ?? null, preferredGravityUnit),
      range: headerFgRange,
      secondary: formatGravitySecondary(preview?.fg ?? null, preferredGravityUnit)
    },
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

      <div className="sticky top-[var(--chrome-top)] z-30 -mx-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/70 bg-card/85 px-4 py-2 backdrop-blur supports-[backdrop-filter]:bg-card/70 sm:px-5">
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${headerSaveStatusMeta.className}`}>
          {headerSaveStatusMeta.icon}
          <span className="hidden sm:inline">{headerSaveStatusMeta.label}</span>
        </span>

        {canSaveDraftNow ? (
          <button
            type="button"
            onClick={() => void persistRecipe({ force: true })}
            disabled={pendingSave}
            className="inline-flex h-7 items-center rounded-full border border-border bg-card px-2.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            Сохранить
          </button>
        ) : null}

        {/* На мобиле метрики уводим в отдельную строку с горизонтальным скроллом
            (order-last + basis-full + flex-nowrap): sticky-панель складывается в
            предсказуемые 2 ряда вместо 3, экономя ~высоту экрана (UX-находка #25). */}
        <dl
          aria-busy={recalculating}
          className={`order-last flex basis-full flex-nowrap items-center gap-x-3 overflow-x-auto text-[11px] tabular-nums text-muted-foreground transition-opacity sm:order-none sm:basis-auto sm:flex-wrap sm:gap-y-1 sm:overflow-visible ${recalculating || previewError ? "opacity-50" : ""}`}
        >
          {headerMetrics.map((metric) => (
            <div key={metric.label} className="flex items-baseline gap-1">
              <dt className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{metric.label}</dt>
              <dd className="font-semibold text-foreground">
                {metric.value}
                {metric.range ? <span className="ml-1 font-normal text-muted-foreground">({metric.range})</span> : null}
                {metric.secondary ? <span className="ml-1 font-normal text-muted-foreground">· {metric.secondary}</span> : null}
              </dd>
            </div>
          ))}
          {headerStyle ? (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground ring-1 ring-inset ring-ring">
              {getBjcpStyleDisplayName(headerStyle)}
            </span>
          ) : null}
        </dl>

        <div className="ml-auto flex items-center gap-1.5">
          {canManagePublication && savedVisibility === "published" && activeRecipeSlug ? (
            <a
              href={`/recipes/${activeRecipeSlug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted sm:text-sm"
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
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-foreground bg-foreground px-3 text-xs font-medium text-background transition-colors hover:bg-foreground/90 disabled:cursor-not-allowed disabled:opacity-60 sm:px-4 sm:text-sm"
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
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm"
            >
              <Lock className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">В&nbsp;приватные</span>
              <span className="sm:hidden">Приватный</span>
            </button>
          ) : null}
          <RecipeActionsMenu
            pending={pendingSave}
            labelsHref={activeRecipeId ? `/app/recipes/${activeRecipeId}/labels` : null}
            // Пустой черновик (B2/#13): варить нечего — форсить создание записи в
            // БД ради пустой болванки незачем. Импорт/экспорт не гейтим тем же
            // условием: импорт BeerXML в пустой новый рецепт — валидный сценарий.
            brewDisabled={!activeRecipeId && !isDraftWorthPersisting}
            onOpenImportExport={() => setImportExportOpen(true)}
            onOpenBrew={() => void handleOpenBrewPicker()}
            // Пока рецепт не создан в БД — удалять нечего. На pendingSave НЕ гейтим:
            // иначе kebab мигал бы на каждом автосейве. Гонку «автосейв в полёте →
            // удаление» закрывает markDeleted (гасит взведённый таймер).
            onDelete={activeRecipeId
              ? () => {
                setDeleteError(null);
                setDeleteConfirmOpen(true);
              }
              : undefined}
          />
        </div>
      </div>

      <section className="-mx-4 border-b border-border/70 bg-gradient-to-b from-card via-card to-muted/50 px-4 py-4 sm:rounded-2xl sm:border sm:border-border sm:bg-card sm:px-5 sm:py-5 sm:shadow-sm">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ring-inset ${visibilityChipMeta.className}`}>
            {visibilityChipMeta.icon}
            {visibilityChipMeta.label}
          </span>
          {activeRecipeId ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground ring-1 ring-inset ring-ring">
              v{activeVersionNumber}
              <span className="text-muted-foreground">• текущая</span>
            </span>
          ) : null}
        </div>

        <div className="grid gap-3 md:grid-cols-[minmax(0,1.6fr)_minmax(240px,1fr)] md:items-start">
          <div className="min-w-0">
            <label htmlFor="recipe-title" className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Название рецепта
            </label>
            <input
              id="recipe-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className="h-11 w-full min-w-0 rounded-xl border border-border bg-card px-3.5 text-base font-semibold text-foreground shadow-sm placeholder:font-normal placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring sm:text-lg"
              placeholder="Например, Tropical NEIPA"
            />
            {sectionErrors.title ? <p className="mt-1 text-xs text-destructive">{sectionErrors.title}</p> : null}
          </div>
          <div className="min-w-0">
            <StylePicker id="recipe-style" value={styleId} onChange={setStyleId} className="min-w-0" />
            {sectionErrors.styleId ? <p className="mt-1 text-xs text-destructive">{sectionErrors.styleId}</p> : null}
          </div>
        </div>

        {activeRecipeId ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
            {recipeVersions.length > 1 ? (
              <label className="inline-flex items-center gap-1.5">
                <span className="text-muted-foreground">Версия:</span>
                <select
                  value={activeRecipeId}
                  onChange={(event) => void handleVersionChange(event.target.value)}
                  className="h-8 min-w-[96px] rounded-md border border-border bg-card px-2 text-xs font-medium text-foreground focus:border-ring focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  {recipeVersions.map((version) => (
                    <option key={version.id} value={version.id}>
                      {`v${version.versionNumber}${version.id === activeRecipeId ? " • current" : ""}`}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <span className="text-xs text-muted-foreground">v{activeVersionNumber}</span>
            )}
            <button
              type="button"
              onClick={() => void handleCreateVersion()}
              disabled={pendingSave}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-border bg-card px-2.5 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
            >
              Новая версия
            </button>
          </div>
        ) : null}

        {visibleSaveResult && !visibleSaveResult.ok ? (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg bg-destructive-subtle px-3 py-2 text-xs text-destructive ring-1 ring-inset ring-destructive-border">
            <CircleAlert className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{visibleSaveResult.message}</span>
            {hasRetriableSaveError ? (
              <button
                type="button"
                onClick={() => void persistRecipe({ force: true })}
                disabled={pendingSave}
                className="shrink-0 font-medium text-destructive underline decoration-destructive-border underline-offset-2 transition-colors hover:text-destructive disabled:opacity-60"
              >
                Повторить
              </button>
            ) : null}
          </div>
        ) : null}

        {!statsDivergenceDismissed && statsDivergence.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-start gap-3 rounded-lg bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground ring-1 ring-inset ring-warning/30">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Показатели автора отличаются от расчёта движка: {statsDivergence.join(", ")}. При сохранении правок применится расчёт.
            </span>
            <button
              type="button"
              onClick={() => setStatsDivergenceDismissed(true)}
              className="shrink-0 rounded-md p-0.5 text-warning-subtle-foreground/70 transition-colors hover:text-warning-subtle-foreground"
              aria-label="Скрыть предупреждение"
              title="Скрыть"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
      </section>

      <section className="grid items-start gap-4 lg:grid-cols-[11fr_9fr]">
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
          onCreateEquipmentProfile={handleCreateEquipmentProfile}
          isInheritedEquipmentSnapshot={isInheritedEquipmentSnapshot}
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
            <section key={section.category} className={`overflow-hidden rounded-2xl border ${hasError ? "border-destructive-border" : "border-border/70"} bg-card shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]`}>
              <header className="flex items-center justify-between gap-3 border-b border-border bg-muted/40 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
                    <IconComponent className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-2">
                      <h2 className="truncate text-base font-semibold text-foreground">{section.title}</h2>
                      {section.subtitle ? <span className="text-sm tabular-nums text-muted-foreground">({section.subtitle})</span> : null}
                    </div>
                    {hasError ? <p className="mt-0.5 text-xs text-destructive">{sectionErrors[`ingredients.${section.category}`]}</p> : null}
                  </div>
                </div>
                {section.category !== "hop" ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    {isWaterTreatmentSection ? (
                      <>
                        <button
                          type="button"
                          onClick={waterSetupOpen ? closeWaterSetup : openWaterSetup}
                          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-border hover:bg-muted hover:text-foreground sm:h-9 sm:px-3 sm:text-sm"
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
                          className="inline-flex h-8 items-center rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground shadow-sm transition-colors hover:border-border hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50 sm:h-9 sm:px-3 sm:text-sm"
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
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-foreground shadow-sm transition-colors hover:border-border hover:bg-muted sm:h-9 sm:px-3 sm:text-sm"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {/* Один и тот же текст на всех брейкпоинтах — один span,
                            иначе скринридер читал «Добавить» дважды (#23). */}
                        <span>Добавить</span>
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
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-ring hover:bg-muted hover:text-foreground disabled:cursor-default disabled:hover:border-border disabled:hover:bg-muted/40 disabled:hover:text-muted-foreground"
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
          <p className="text-xs text-destructive">{sectionErrors["processMeta.mashProfile.steps"]}</p>
        ) : null}
        {sectionErrors["processMeta.fermentationProfile"] ? (
          <p className="text-xs text-destructive">{sectionErrors["processMeta.fermentationProfile"]}</p>
        ) : null}
      </div>

      <section className="space-y-4">
        <RecipeImagesSection
          recipeId={activeRecipeId}
          recipeTitle={title}
          initialImages={initialImages}
          draftSeed={payload}
          onRecipeCreated={handleRecipeCreatedFromImages}
        />
        <div className="grid gap-4 lg:grid-cols-2">
          <details className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]" open>
            <summary className="flex cursor-pointer list-none items-center gap-2.5 border-b border-transparent bg-muted/40 px-4 py-3 text-sm font-semibold text-foreground group-open:border-border">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400">
                <FileText className="h-4 w-4" />
              </div>
              <span className="text-[15px]">Описание рецепта</span>
              <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">публично</span>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="p-4">
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
                placeholder="Публичное описание рецепта — что это за пиво, вдохновение, особенности…"
              />
              {sectionErrors.description ? <p className="mt-2 text-xs text-destructive">{sectionErrors.description}</p> : null}
            </div>
          </details>
          <details className="group overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_1px_3px_0_rgb(0_0_0_/_0.04)]" open>
            <summary className="flex cursor-pointer list-none items-center gap-2.5 border-b border-transparent bg-muted/40 px-4 py-3 text-sm font-semibold text-foreground group-open:border-border">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400">
                <StickyNote className="h-4 w-4" />
              </div>
              <span className="text-[15px]">Личные заметки</span>
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                <Lock className="h-3 w-3" />
                приватно
              </span>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-90" />
            </summary>
            <div className="p-4">
              <textarea
                value={authorNotes}
                onChange={(event) => setAuthorNotes(event.target.value)}
                className="min-h-28 w-full rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-base text-foreground placeholder:text-muted-foreground focus:border-ring focus:bg-card focus:outline-none focus:ring-2 focus:ring-ring sm:text-sm"
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

      <ConfirmActionDialog
        open={deleteConfirmOpen}
        title="Удалить рецепт?"
        description={deleteRecipeDescription}
        confirmLabel="Удалить рецепт"
        pendingLabel="Удаляем..."
        pending={deletePending}
        error={deleteError}
        onConfirm={() => void handleDeleteRecipe()}
        onClose={() => {
          if (deletePending) {
            return;
          }
          setDeleteConfirmOpen(false);
          setDeleteError(null);
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
        preferredGravityUnit={preferredGravityUnit}
      />

      {brewPickerRecipeId ? (
        <BrewPickerDialog
          open={brewPickerOpen}
          onOpenChange={setBrewPickerOpen}
          recipeId={brewPickerRecipeId}
          recipeTitle={title}
        />
      ) : null}

      <IngredientAddDrawer open={Boolean(openEditor)} onClose={() => requestCloseEditor()}>
        {editorPanel}
      </IngredientAddDrawer>

      <ConfirmActionDialog
        open={closeConfirmOpen}
        title="Закрыть без сохранения?"
        description="Изменения в этой позиции не сохранятся."
        confirmLabel="Закрыть"
        cancelLabel="Вернуться"
        onConfirm={confirmCloseEditor}
        onClose={cancelCloseEditor}
      />
    </div>
  );
}
