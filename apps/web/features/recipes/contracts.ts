import {
  bitternessFormulas,
  mashPhModels,
  waterEngineModes,
  type BitternessFormula,
  type MashPhModel,
  type StyleFitResult,
  type StyleRange,
  type WaterEngineMode
} from "@nb/brewing-core";
import { z } from "zod";

import {
  ingredientCategories,
  ingredientTypes,
  type IngredientCategory,
  type IngredientSubtype,
  type IngredientTechnicalData,
  type IngredientType
} from "../ingredients/contracts";
import { resolveIngredientCategory, resolveLegacyIngredientType, resolveIngredientSubtype } from "../ingredients/taxonomy";
import { inventoryUnits, type InventoryUnit, type InventoryUnitDimension } from "../inventory/units";
import { equipmentProfileSnapshotSchema, type EquipmentProfileSnapshot } from "../equipment-profiles/contracts";

export const recipePublicationStates = ["draft", "private", "published"] as const;
export const recipeIngredientStages = ["mash", "boil", "whirlpool", "fermentation", "packaging", "other"] as const;
export const recipeHopUseTypes = ["boil", "first_wort_hop", "whirlpool", "dry_hop", "dip_hop", "other"] as const;
export const recipeFermentableUseTypes = ["mash", "steep", "boil"] as const;
export const recipeInventoryIntentModes = ["none", "use_stock", "catalog", "custom", "imported"] as const;
export const recipeBitternessFormulas = bitternessFormulas;
export const recipeWaterEngineModes = waterEngineModes;
export const recipeMashPhModels = mashPhModels;
export const recipeWaterManualSaltAdditionTargets = ["all", "mash", "sparge"] as const;

export type RecipePublicationState = (typeof recipePublicationStates)[number];
export type RecipeIngredientStage = (typeof recipeIngredientStages)[number];
export type RecipeHopUseType = (typeof recipeHopUseTypes)[number];
export type RecipeFermentableUseType = (typeof recipeFermentableUseTypes)[number];
export type RecipeInventoryIntentMode = (typeof recipeInventoryIntentModes)[number];
export type RecipeWaterManualSaltAdditionTarget = (typeof recipeWaterManualSaltAdditionTargets)[number];

export const recipeBitternessFormulaLabels: Record<BitternessFormula, string> = {
  tinseth_whirlpool_v2: "Tinseth + whirlpool v2",
  tinseth_classic: "Tinseth classic",
  rager: "Rager",
  garetz: "Garetz",
  noonan_legacy: "Noonan legacy"
};

export const recipeWaterEngineLabels: Record<WaterEngineMode, string> = {
  profile_only: "Профиль воды",
  balanced_default: "Баланс + pH",
  advanced_manual: "Advanced manual"
};

export const recipeMashPhModelLabels: Record<MashPhModel, string> = {
  kolbach_ra_quick: "Kolbach RA quick",
  hybrid_mash_ph_v1: "Hybrid mash pH v1"
};

export const recipePublicationStateLabels: Record<RecipePublicationState, string> = {
  draft: "Приватный",
  private: "Приватный",
  published: "Публичный"
};

const numberField = () => z.coerce.number({
  invalid_type_error: "Введите число.",
  required_error: "Укажите значение."
});

const mashStepSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80).default("Инфузия"),
  temperatureC: numberField().min(0, "Температура затора не может быть ниже 0 °C.").max(100, "Температура затора не может быть выше 100 °C."),
  durationMinutes: numberField().int("Длительность шага должна быть целым числом.").min(1, "Длительность шага должна быть не меньше 1 минуты.").max(600, "Длительность шага не может быть больше 600 минут.")
});

const fermentationStepSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  temperatureC: numberField().min(-10, "Температура брожения не может быть ниже -10 °C.").max(50, "Температура брожения не может быть выше 50 °C.").optional().nullable(),
  durationDays: numberField().int("Длительность брожения должна быть целым числом.").min(1, "Длительность брожения должна быть не меньше 1 дня.").max(365, "Длительность брожения не может быть больше 365 дней.").optional().nullable()
});

const optionalTemperatureStepSchema = z.object({
  enabled: z.coerce.boolean().default(false),
  temperatureC: numberField().min(-10, "Температура брожения не может быть ниже -10 °C.").max(50, "Температура брожения не может быть выше 50 °C.").optional().nullable(),
  durationDays: numberField().int("Длительность брожения должна быть целым числом.").min(1, "Длительность брожения должна быть не меньше 1 дня.").max(365, "Длительность брожения не может быть больше 365 дней.").optional().nullable()
});

export const defaultRecipeProcessMeta = {
  mashProfile: {
    steps: [] as Array<{
      id: string;
      name: string;
      temperatureC: number;
      durationMinutes: number;
    }>
  },
  fermentationProfile: {
    primaryTemperatureC: 20,
    primaryDurationDays: 10,
    extraSteps: [] as Array<{
      id: string;
      name: string;
      temperatureC?: number | null;
      durationDays?: number | null;
    }>,
    coldCrash: {
      enabled: false,
      temperatureC: 2,
      durationDays: 2
    },
    conditioning: {
      enabled: false,
      temperatureC: 12,
      durationDays: 14
    }
  }
};

export const recipeProcessMetaSchema = z.object({
  mashProfile: z.object({
    steps: z.array(mashStepSchema).max(10).default(defaultRecipeProcessMeta.mashProfile.steps)
  }).default(defaultRecipeProcessMeta.mashProfile),
  fermentationProfile: z.object({
    primaryTemperatureC: numberField().min(-10, "Температура брожения не может быть ниже -10 °C.").max(50, "Температура брожения не может быть выше 50 °C.").optional().nullable().default(defaultRecipeProcessMeta.fermentationProfile.primaryTemperatureC),
    primaryDurationDays: numberField().int("Длительность брожения должна быть целым числом.").min(1, "Длительность брожения должна быть не меньше 1 дня.").max(365, "Длительность брожения не может быть больше 365 дней.").optional().nullable().default(defaultRecipeProcessMeta.fermentationProfile.primaryDurationDays),
    extraSteps: z.array(fermentationStepSchema).max(10).default([]),
    coldCrash: optionalTemperatureStepSchema.default(defaultRecipeProcessMeta.fermentationProfile.coldCrash),
    conditioning: optionalTemperatureStepSchema.default(defaultRecipeProcessMeta.fermentationProfile.conditioning)
  }).default(defaultRecipeProcessMeta.fermentationProfile)
}).default(defaultRecipeProcessMeta);

export type RecipeProcessMeta = z.infer<typeof recipeProcessMetaSchema>;

export const recipeFgEstimateModes = [
  "unavailable",
  "default_estimate",
  "yeast_estimate",
  "manual_attenuation_override",
  "manual_fg_override"
] as const;
export type RecipeFgEstimateMode = (typeof recipeFgEstimateModes)[number];

export const recipeFgAttenuationSources = ["default", "yeast", "manual"] as const;
export type RecipeFgAttenuationSource = (typeof recipeFgAttenuationSources)[number];

export const recipeFgEstimateDetailsSchema = z.object({
  baseAttenuationPct: numberField().min(0, "Аттенюация не может быть меньше 0%.").max(100, "Аттенюация не может быть больше 100%."),
  attenuationSource: z.enum(recipeFgAttenuationSources),
  mainMashTempC: z.coerce.number().min(0).max(100).optional().nullable(),
  mashAdjPctPoints: z.coerce.number().min(-20).max(20),
  simpleSugarSharePct: z.coerce.number().min(0).max(100),
  crystalDextrinSharePct: z.coerce.number().min(0).max(100),
  lactoseSharePct: z.coerce.number().min(0).max(100),
  simpleSugarAdj: z.coerce.number().min(0).max(10),
  crystalDextrinAdj: z.coerce.number().min(0).max(10),
  lactoseAdj: z.coerce.number().min(0).max(10),
  effectiveAttenuationPct: z.coerce.number().min(0).max(100),
  fgRangeMin: z.coerce.number().min(0.99).max(1.2).optional().nullable(),
  fgRangeMax: z.coerce.number().min(0.99).max(1.2).optional().nullable()
});

export type RecipeFgEstimateDetails = z.infer<typeof recipeFgEstimateDetailsSchema>;

export const recipeCalculationMetaSchema = z.object({
  bitternessFormula: z.enum(recipeBitternessFormulas).default("tinseth_whirlpool_v2"),
  bitternessSettings: z.object({
    includeBoilCarryoverIntoWhirlpool: z.coerce.boolean().default(true),
    whirlpoolUtilizationFactor: numberField().positive("Коэффициент whirlpool должен быть больше нуля.").max(3, "Коэффициент whirlpool не может быть больше 3.").default(1),
    hopFormUtilizationFactor: numberField().positive("Коэффициент хмеля должен быть больше нуля.").max(3, "Коэффициент хмеля не может быть больше 3.").default(1),
    firstWortHopMode: z.enum(["bonus_10pct", "treat_as_20min", "treat_as_boil_start"]).default("bonus_10pct")
  }).partial().default({}),
  fgEstimateMode: z.enum(recipeFgEstimateModes).optional().nullable(),
  manualAttenuationOverridePct: numberField().min(0, "Аттенюация не может быть меньше 0%.").max(100, "Аттенюация не может быть больше 100%.").optional().nullable(),
  manualFgOverrideValue: numberField().min(0.99, "КП не может быть ниже 0.990.").max(1.2, "КП не может быть выше 1.200.").optional().nullable(),
  fgEstimateDetails: recipeFgEstimateDetailsSchema.optional().nullable()
}).default({
  bitternessFormula: "tinseth_whirlpool_v2",
  bitternessSettings: {}
});

export type RecipeCalculationMeta = z.infer<typeof recipeCalculationMetaSchema>;

const waterProfileSchema = z.object({
  ca: numberField().min(0, "Кальций не может быть меньше 0 ppm.").default(0),
  mg: numberField().min(0, "Магний не может быть меньше 0 ppm.").default(0),
  na: numberField().min(0, "Натрий не может быть меньше 0 ppm.").default(0),
  cl: numberField().min(0, "Хлориды не могут быть меньше 0 ppm.").default(0),
  so4: numberField().min(0, "Сульфаты не могут быть меньше 0 ppm.").default(0),
  hco3: numberField().min(0, "Щелочность не может быть меньше 0 ppm.").default(0),
  ph: numberField().min(0, "pH не может быть ниже 0.").max(14, "pH не может быть выше 14.").optional().nullable()
});

export const recipeWaterPlanMetaSchema = z.object({
  setupEnabled: z.coerce.boolean().default(false),
  engine: z.enum(recipeWaterEngineModes).default("balanced_default"),
  phModel: z.enum(recipeMashPhModels).default("hybrid_mash_ph_v1"),
  sourceProfileMode: z.enum(["saved", "preset", "manual", "ro_distilled", "distilled"]).default("preset"),
  sourceProfilePresetId: z.string().trim().max(80).optional().nullable(),
  sourceProfileSavedId: z.string().trim().max(120).optional().nullable(),
  sourceProfileName: z.string().trim().max(120).optional().nullable(),
  sourceProfile: waterProfileSchema.optional().nullable(),
  targetProfileMode: z.enum(["saved", "catalog", "manual", "balanced", "malty", "hoppy", "style"]).default("catalog"),
  targetProfilePresetId: z.string().trim().max(80).optional().nullable(),
  targetProfileSlug: z.string().trim().max(160).optional().nullable(),
  targetProfileSavedId: z.string().trim().max(120).optional().nullable(),
  targetProfileName: z.string().trim().max(160).optional().nullable(),
  targetProfileSource: z.enum(["auto_style", "user_catalog", "user_saved", "manual"]).optional().nullable(),
  targetProfileIsOverridden: z.coerce.boolean().optional().nullable(),
  targetProfileResolvedFromBjcpStyleKey: z.string().trim().max(120).optional().nullable(),
  targetProfile: waterProfileSchema.optional().nullable(),
  /**
   * @deprecated Salts and acids are always shown read-only in the recipe ingredient list now.
   * Field is kept in the schema for backward compatibility with persisted recipes.
   */
  showWaterAdditivesInIngredients: z.coerce.boolean().default(false),
  blendRatio: z.object({
    tap: numberField().min(0, "Доля водопроводной воды не может быть меньше 0.").max(1, "Доля водопроводной воды не может быть больше 1.").default(1),
    ro: numberField().min(0, "Доля RO-воды не может быть меньше 0.").max(1, "Доля RO-воды не может быть больше 1.").default(0),
    distilled: numberField().min(0, "Доля дистиллированной воды не может быть меньше 0.").max(1, "Доля дистиллированной воды не может быть больше 1.").default(0)
  }).optional().nullable(),
  mashWaterVolumeL: numberField().min(0, "Объём заторной воды не может быть меньше 0 л.").optional().nullable(),
  spargeWaterVolumeL: numberField().min(0, "Объём промывочной воды не может быть меньше 0 л.").optional().nullable(),
  totalWaterVolumeL: numberField().min(0, "Общий объём воды не может быть меньше 0 л.").optional().nullable(),
  grainAbsorptionLPerKg: numberField().min(0, "Водопоглощение дробиной не может быть меньше 0 л/кг.").max(5, "Водопоглощение дробиной не может быть больше 5 л/кг.").optional().nullable(),
  allowedSalts: z.array(z.string()).optional().default([]),
  allowedAcids: z.array(z.string()).optional().default([]),
  manualSaltAdditions: z.array(z.object({
    salt: z.string(),
    grams: numberField().min(0, "Количество соли не может быть меньше 0 г."),
    target: z.enum(recipeWaterManualSaltAdditionTargets).optional()
  })).optional().default([]),
  targetMashPh: numberField().min(4, "Целевой pH затора не может быть ниже 4.").max(7, "Целевой pH затора не может быть выше 7.").optional().nullable().default(null),
  spargeAcidificationEnabled: z.coerce.boolean().default(false),
  spargeSourcePh: numberField().min(0, "pH промывочной воды не может быть ниже 0.").max(14, "pH промывочной воды не может быть выше 14.").optional().nullable(),
  targetSpargePh: numberField().min(4, "Целевой pH промывочной воды не может быть ниже 4.").max(7, "Целевой pH промывочной воды не может быть выше 7.").optional().nullable(),
  targetSpargeAlkalinity: numberField().min(0, "Щелочность промывочной воды не может быть меньше 0.").optional().nullable(),
  selectedAcid: z.enum(["lactic_acid", "phosphoric_acid"]).optional().nullable(),
  acidConcentrationPct: numberField().positive("Концентрация кислоты должна быть больше 0%.").max(100, "Концентрация кислоты не может быть больше 100%.").optional().nullable(),
  calibrationOffset: numberField().min(-2, "Калибровочная поправка не может быть меньше -2 pH.").max(2, "Калибровочная поправка не может быть больше 2 pH.").optional().nullable()
}).default({
  setupEnabled: false,
  engine: "balanced_default",
  phModel: "hybrid_mash_ph_v1",
  sourceProfileMode: "preset",
  sourceProfilePresetId: "ro_distilled",
  sourceProfileSavedId: null,
  sourceProfileName: null,
  targetProfileMode: "catalog",
  targetProfilePresetId: null,
  targetProfileSlug: null,
  targetProfileSavedId: null,
  targetProfileName: null,
  targetProfileSource: null,
  targetProfileIsOverridden: false,
  targetProfileResolvedFromBjcpStyleKey: null,
  showWaterAdditivesInIngredients: false,
  allowedSalts: [],
  allowedAcids: [],
  manualSaltAdditions: [],
  targetMashPh: null,
  spargeAcidificationEnabled: false,
  spargeSourcePh: null,
  targetSpargePh: 5.7,
  selectedAcid: "lactic_acid"
});

export type RecipeWaterPlanMeta = z.infer<typeof recipeWaterPlanMetaSchema>;

export const recipeInventorySelectionMetaSchema = z.object({
  inventoryItemId: z.string().uuid().optional().nullable(),
  stockQuantityLabel: z.string().trim().max(120).optional().nullable(),
  stockNormalizedQuantity: z.coerce.number().min(0).optional().nullable(),
  stockNormalizedUnit: z.string().trim().max(32).optional().nullable(),
  freshnessDate: z.string().trim().max(64).optional().nullable()
}).passthrough();

export type RecipeInventorySelectionMeta = z.infer<typeof recipeInventorySelectionMetaSchema>;

export type RecipeImportedIngredientSnapshot = {
  version: 1;
  source?: string | null;
  name: string;
  type: IngredientType;
  category: IngredientCategory;
  subtype?: IngredientSubtype | null;
  defaultDisplayUnit?: InventoryUnit | null;
  allowedUnits?: InventoryUnit[] | null;
  measurementDimension?: InventoryUnitDimension | null;
  technicalData?: IngredientTechnicalData | null;
};

export const recipeSourceLinkageSchema = z.object({
  ingredientCatalogItemId: z.string().trim().min(1).optional().nullable(),
  userCustomIngredientId: z.string().uuid().optional().nullable()
}).refine((value) => Boolean(value.ingredientCatalogItemId) !== Boolean(value.userCustomIngredientId), {
  message: "Exactly one source is required",
  path: ["ingredientCatalogItemId"]
});

export const recipeIngredientPayloadSchema = z.object({
  persistentKey: z.string().uuid().optional().nullable(),
  ingredientCatalogItemId: z.string().trim().min(1).optional().nullable(),
  userCustomIngredientId: z.string().uuid().optional().nullable(),
  type: z.enum(ingredientTypes).optional(),
  category: z.enum(ingredientCategories).optional(),
  subtype: z.string().trim().max(80).optional().nullable(),
  familyId: z.string().uuid().optional().nullable(),
  amountEnteredQuantity: numberField().positive("Количество ингредиента должно быть больше нуля."),
  amountEnteredUnit: z.string().trim().toLowerCase().pipe(z.enum(inventoryUnits)),
  stage: z.enum(recipeIngredientStages).default("other"),
  timeOffset: z.coerce.number().int().optional().nullable(),
  stepMeta: z.record(z.string(), z.unknown()).optional().nullable(),
  inventoryIntentMode: z.enum(recipeInventoryIntentModes).optional().nullable(),
  inventorySelectionMeta: recipeInventorySelectionMetaSchema.optional().nullable(),
  externalImportMeta: z.record(z.string(), z.unknown()).optional().nullable()
}).superRefine((value, ctx) => {
  const hasCatalogSource = Boolean(value.ingredientCatalogItemId);
  const hasCustomSource = Boolean(value.userCustomIngredientId);

  if (value.inventoryIntentMode === "imported") {
    if (hasCatalogSource || hasCustomSource) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Imported ingredient must not be linked to catalog or custom source",
        path: ["ingredientCatalogItemId"]
      });
    }
  } else if (hasCatalogSource === hasCustomSource) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Exactly one source is required",
      path: ["ingredientCatalogItemId"]
    });
  }

  if (!value.type && !value.category) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Category is required",
      path: ["category"]
    });
    return;
  }

  if (value.category) {
    const resolvedCategory = resolveIngredientCategory(value);
    if (resolvedCategory !== value.category) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Category conflicts with subtype/type mapping",
        path: ["category"]
      });
    }
  }

  if (value.subtype) {
    const resolvedSubtype = resolveIngredientSubtype(value);
    if (!resolvedSubtype) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Subtype conflicts with category",
        path: ["subtype"]
      });
    }
  }

  if (value.type && value.category == null) {
    const resolvedType = resolveLegacyIngredientType(value);
    if (resolvedType !== value.type) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Type conflicts with category/subtype mapping",
        path: ["type"]
      });
    }
  }
});

const baseRecipePayloadSchema = z.object({
  publicationState: z.enum(recipePublicationStates).default("private"),
  title: z.string().trim().min(1, "Укажите название рецепта.").max(180, "Название рецепта не должно быть длиннее 180 символов."),
  styleId: z.string().trim().max(64).optional().nullable(),
  batchSizeEnteredQuantity: numberField().positive("Объём партии должен быть больше нуля."),
  batchSizeEnteredUnit: z.string().trim().toLowerCase().pipe(z.enum(inventoryUnits)),
  efficiency: numberField().positive("Эффективность должна быть больше 0%.").max(100, "Эффективность не может быть больше 100%.").optional().nullable(),
  boilTimeMinutes: numberField().int("Время кипячения должно быть целым числом.").min(1, "Время кипячения должно быть не меньше 1 минуты.").max(600, "Время кипячения не может быть больше 600 минут.").default(60),
  description: z.string().trim().max(6000, "Описание не должно быть длиннее 6000 символов.").optional().nullable(),
  authorNotes: z.string().trim().max(6000, "Заметки не должны быть длиннее 6000 символов.").optional().nullable(),
  processMeta: recipeProcessMetaSchema.optional().nullable(),
  calculationMeta: recipeCalculationMetaSchema.optional().nullable(),
  draftState: z.record(z.string(), z.unknown()).optional().nullable(),
  importMeta: z.record(z.string(), z.unknown()).optional().nullable(),
  equipmentProfileId: z.string().uuid().optional().nullable(),
  equipmentProfileSnapshot: equipmentProfileSnapshotSchema.optional().nullable(),
  waterPlanMeta: recipeWaterPlanMetaSchema.optional().nullable(),
  brewPlanMeta: z.record(z.string(), z.unknown()).optional().nullable(),
  heroImageId: z.string().uuid().optional().nullable()
});

export const createRecipePayloadSchema = baseRecipePayloadSchema.extend({
  ingredients: z.array(recipeIngredientPayloadSchema).max(200).default([])
});

export const updateRecipePayloadSchema = baseRecipePayloadSchema.partial().extend({
  ingredients: z.array(recipeIngredientPayloadSchema).max(200).optional(),
  recomputeStats: z.coerce.boolean().default(true)
});

export const listAuthorRecipesQuerySchema = z.object({
  publicationState: z.enum(recipePublicationStates).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export type RecipeIngredientDto = {
  id: string;
  recipeId: string;
  persistentKey: string;
  displayOrder: number;
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  type: IngredientType;
  ingredientCategory?: IngredientCategory | null;
  ingredientSubtype?: IngredientSubtype | null;
  ingredientFamilyId?: string | null;
  ingredientDisplayName?: string | null;
  ingredientDisplayNameRu?: string | null;
  ingredientDisplayNameEn?: string | null;
  ingredientDisplayNameSnapshot?: string | null;
  ingredientFamilyDisplayName?: string | null;
  ingredientSummary?: string | null;
  ingredientBrand?: string | null;
  ingredientProducer?: string | null;
  ingredientBrandName?: string | null;
  ingredientManufacturer?: string | null;
  ingredientCountryCode?: string | null;
  ingredientCountryName?: string | null;
  ingredientCountry?: string | null;
  ingredientDefaultDisplayUnit?: InventoryUnit | null;
  ingredientDefaultDisplayUnitSnapshot?: InventoryUnit | null;
  ingredientAllowedUnits?: InventoryUnit[] | null;
  ingredientMeasurementDimension?: InventoryUnitDimension | null;
  ingredientMeasurementDimensionSnapshot?: InventoryUnitDimension | null;
  ingredientTechnicalData?: IngredientTechnicalData | null;
  amountEnteredQuantity: number;
  amountEnteredUnit: InventoryUnit;
  amountNormalizedQuantity: number;
  amountNormalizedUnit: InventoryUnit;
  stage: RecipeIngredientStage;
  timeOffset: number | null;
  stepMeta: Record<string, unknown> | null;
  inventoryIntentMode?: RecipeInventoryIntentMode | null;
  inventorySelectionMeta?: RecipeInventorySelectionMeta | null;
  externalImportMeta?: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RecipeListItemDto = {
  id: string;
  authorId: string;
  recipeFamilyId: string;
  versionNumber: number;
  versionCount: number;
  publicationState: RecipePublicationState;
  title: string;
  slug: string;
  styleId: string | null;
  batchSizeEnteredQuantity: number;
  batchSizeEnteredUnit: InventoryUnit;
  batchSizeNormalizedQuantity: number;
  batchSizeNormalizedUnit: InventoryUnit;
  efficiency: number | null;
  boilTimeMinutes: number;
  og: number | null;
  fg: number | null;
  abv: number | null;
  ibu: number | null;
  color: number | null;
  createdAt: Date;
  updatedAt: Date;
};

export type RecipeVersionOptionDto = {
  id: string;
  versionNumber: number;
  updatedAt: Date;
};

/**
 * View-model карточки рецепта владельца для галереи `/app/recipes`. В отличие от
 * «голого» {@link RecipeListItemDto}, здесь обложка (фото → картинка BJCP-стиля →
 * заливка по SRM), название/код стиля и итог style-fit уже разрешены на сервере —
 * клиентская галерея делает только фильтр/сортировку/переключение вида и не тащит
 * доменные пакеты в бандл. Полностью сериализуемо (Date для `updatedAt`).
 */
export type OwnerRecipeCardDto = {
  id: string;
  slug: string;
  title: string;
  publicationState: RecipePublicationState;
  versionNumber: number;
  versionCount: number;
  updatedAt: Date;
  styleName: string | null;
  styleCode: string | null;
  styleHref: string | null;
  og: number | null;
  abv: number | null;
  ibu: number | null;
  colorSrm: number | null;
  heroImage: { thumbUrl: string; blurDataUrl: string | null } | null;
  styleImageUrl: string | null;
  styleFit: "in_style" | "deviations" | null;
};

// --- Public recipe discovery (витрина /recipes) -----------------------------

/**
 * Метод варки. Сейчас НИГДЕ не персистится на рецепте (нет колонки, нет в
 * processMeta), поэтому в Phase A фильтр по методу не применяется и в карточке
 * method = null. Тип оставлен для совместимости и будущих фаз.
 */
export const recipeMethods = ["all_grain", "biab", "extract"] as const;
export type RecipeMethod = (typeof recipeMethods)[number];

export const publicRecipeSorts = [
  "newest",
  "abv_desc",
  "abv_asc",
  "ibu_desc",
  "ibu_asc",
  "color_asc",
  "color_desc",
  "name",
  "popular", // по числу сохранений («Избранные»): save_count desc
  "rating" // по среднему рейтингу: rating_avg desc (NULLS LAST)
] as const;
export type PublicRecipeSort = (typeof publicRecipeSorts)[number];

export const defaultPublicRecipePageSize = 24;
export const maxPublicRecipePageSize = 48;

export type PublicRecipeFilters = {
  q?: string;
  family?: string; // id семейства BJCP из getBjcpCatalogData()
  styleCode?: string; // код/styleKey стиля BJCP
  colorMinSrm?: number;
  colorMaxSrm?: number;
  abvMin?: number;
  abvMax?: number;
  ibuMin?: number;
  ibuMax?: number;
  method?: RecipeMethod[]; // парсится, но в Phase A не применяется к WHERE
  sort: PublicRecipeSort;
  page: number; // 1-based
  pageSize: number;
};

export type PublicRecipeListItem = {
  id: string;
  slug: string;
  name: string;
  author: { id: string; displayName: string | null; image: string | null };
  style: { code: string; name: string } | null;
  styleHref: string | null; // ссылка на BJCP-страницу стиля (`/bjcp/<slug>`), null если стиля нет
  og: number | null;
  fg: number | null;
  abv: number | null;
  ibu: number | null;
  colorSrm: number | null;
  colorEbc: number | null;
  batchSizeL: number | null;
  method: RecipeMethod | null; // null в Phase A
  heroImage: { thumbUrl: string; blurDataUrl: string | null } | null;
  /**
   * URL реальной фотографии BJCP-стиля (как на карточках `/bjcp`) для рецептов
   * без своего фото. `null`, если стиль не указан или у него только плейсхолдер —
   * тогда карточка падает на мягкую цветовую заливку по SRM.
   */
  styleImageUrl: string | null;
  cloneCount: number; // 0 в Phase A
  rating: { average: number; count: number } | null; // null до Phase D
  saveCount: number; // число сохранений («Избранные») — источник для сортировки «Популярные»
  publishedAt: string; // ISO; маппится из updatedAt (publishedAt-колонки нет)
  createdAt: string; // ISO; для бейджа «Новый» (окно NEW_RECIPE_WINDOW_DAYS)
};

export type PublicRecipeFacets = {
  families: { id: string; name: string; count: number }[];
  styles: { code: string; name: string; count: number }[];
};

export type PublicRecipeListResult = {
  items: PublicRecipeListItem[];
  total: number;
  page: number;
  pageSize: number;
  facets?: PublicRecipeFacets; // опционально (Phase C)
};

// Рейтинги (Phase D, §3.4). Валидация на сервере: stars 1..5, body до 2000 симв.
// (пустой body → null). userId НЕ входит в payload — берётся только на сервере.
export const recipeRatingInputSchema = z.object({
  stars: z.coerce.number().int().min(1).max(5),
  body: z
    .string()
    .trim()
    .max(2000)
    .optional()
    .nullable()
    .transform((value) => (value && value.length > 0 ? value : null))
});
export type RecipeRatingInput = z.infer<typeof recipeRatingInputSchema>;

/** Оценка текущего пользователя по рецепту (для предзаполнения формы). */
export type RecipeRatingDto = {
  stars: number;
  body: string | null;
};

/** Денормализованный агрегат рейтинга рецепта. */
export type RecipeRatingSummary = {
  average: number;
  count: number;
};

/** Результат toggle сохранения рецепта: новое состояние + денормализованный счётчик. */
export type RecipeSaveSummary = {
  saved: boolean;
  count: number;
};

/**
 * Атрибуция клона: исходный рецепт, из которого пользователь сделал свою копию
 * («Адаптировано из «{title}», автор {authorName}»). `isPublished` управляет тем,
 * показывать ли ссылку на публичную страницу источника.
 */
export type RecipeCloneSourceDto = {
  id: string;
  title: string;
  slug: string;
  authorId: string;
  authorName: string | null;
  isPublished: boolean;
};

/**
 * Атрибуция первоисточника рецепта (для заимствованных/импортированных рецептов):
 * ссылка на оригинал + название площадки + происхождение/автор. Хранится в
 * `recipes.importMeta.sourceAttribution`; показывается блоком на странице рецепта.
 * Отдельный ключ от строкового `importMeta.source` («beerxml»/«brewfather_json»),
 * чтобы не конфликтовать с интероп-провенансом.
 */
export type RecipeSourceAttribution = {
  url: string | null;
  siteName: string | null;
  origin: string | null;
  author: string | null;
};

export const recipeSourceAttributionSchema = z.object({
  url: z.string().trim().max(2048).nullish(),
  siteName: z.string().trim().max(160).nullish(),
  origin: z.string().trim().max(2000).nullish(),
  author: z.string().trim().max(200).nullish()
});

/**
 * Толерантно читает атрибуцию источника из `importMeta.sourceAttribution`.
 * Возвращает null, если поля нет/мусор или если нет ни ссылки, ни происхождения
 * (нечего показывать). Не бросает на чужой форме importMeta.
 */
export const readRecipeSourceAttribution = (
  importMeta: Record<string, unknown> | null | undefined
): RecipeSourceAttribution | null => {
  if (!importMeta || typeof importMeta !== "object") {
    return null;
  }

  const parsed = recipeSourceAttributionSchema.safeParse(
    (importMeta as Record<string, unknown>).sourceAttribution
  );
  if (!parsed.success) {
    return null;
  }

  const url = parsed.data.url?.trim() || null;
  const siteName = parsed.data.siteName?.trim() || null;
  const origin = parsed.data.origin?.trim() || null;
  const author = parsed.data.author?.trim() || null;

  if (!url && !origin) {
    return null;
  }

  return { url, siteName, origin, author };
};

/** Результат server-action «Клонировать» (мост публичное/сохранённое → мои рецепты). */
export type RecipeCloneActionResult =
  | { ok: true; recipeId: string }
  | { ok: false; code: "AUTH" | "NOT_FOUND" | "ERROR"; message: string };

export type RecipeDetailDto = RecipeListItemDto & {
  description: string | null;
  authorNotes: string | null;
  processMeta: RecipeProcessMeta;
  calculationMeta?: RecipeCalculationMeta | null;
  fgEstimateMode?: RecipeFgEstimateMode | null;
  fgEstimateDetails?: RecipeFgEstimateDetails | null;
  draftState?: Record<string, unknown> | null;
  importMeta?: Record<string, unknown> | null;
  equipmentProfileId?: string | null;
  equipmentProfileSnapshot?: EquipmentProfileSnapshot | null;
  waterPlanMeta?: RecipeWaterPlanMeta | null;
  brewPlanMeta?: Record<string, unknown> | null;
  heroImageId: string | null;
  ingredients: RecipeIngredientDto[];
  versions: RecipeVersionOptionDto[];
  rating: { average: number; count: number } | null; // денормализованный агрегат (Phase D)
  // Источник клона (если рецепт создан копированием чужого/своего published). null
  // у оригиналов. Баннер атрибуции рендерится только когда автор источника ≠ автор копии.
  clonedFrom?: RecipeCloneSourceDto | null;
};

export type RecipeDraftPreviewDto = {
  batchSizeEnteredQuantity: number;
  batchSizeEnteredUnit: InventoryUnit;
  boilTimeMinutes: number;
  og: number | null;
  fg: number | null;
  fgEstimateMode: RecipeFgEstimateMode;
  fgEstimateDetails: RecipeFgEstimateDetails | null;
  abv: number | null;
  ibu: number | null;
  bitternessFormula?: BitternessFormula;
  color: number | null;
  styleId: string | null;
  styleRange: StyleRange | null;
  styleFit: StyleFitResult | null;
};

export type RecipeStockCoverageLineDto = {
  recipeIngredientId: string;
  recipeIngredientPersistentKey: string;
  displayOrder: number;
  ingredientDisplayName: string | null;
  requiredQuantityNormalized: number;
  requiredNormalizedUnit: InventoryUnit;
  allocatedQuantityNormalized: number;
  availableQuantityNormalized: number | null;
  normalizedUnit: InventoryUnit;
  status: "unselected" | "short" | "covered" | "reserved" | "consumed" | "released";
  inventoryItemId: string | null;
  inventoryDisplayName: string | null;
  allocationId: string | null;
};

export type RecipeStockCoverageDto = {
  recipeId: string;
  lines: RecipeStockCoverageLineDto[];
  summary: {
    totalLines: number;
    selectedLines: number;
    coveredLines: number;
    reservedLines: number;
    consumedLines: number;
    shortLines: number;
  };
};

// Discovery-матчинг «склад ↔ рецепт» (Stage 6). Read-only, работает для любого
// просматриваемого рецепта (свой или published), независимо от allocation-движка
// автора. Семейный/сортовой матчинг считается на лету (см. match-service.ts).
export type RecipeMatchLineStatus = "covered" | "substitute" | "partial" | "missing";

export type RecipeMatchLineDto = {
  recipeIngredientId: string;
  persistentKey: string;
  displayOrder: number;
  ingredientDisplayName: string | null;
  category: IngredientCategory | null;
  status: RecipeMatchLineStatus;
  coveragePercent: number;
  requiredQuantityNormalized: number;
  availableQuantityNormalized: number;
  shortfallNormalized: number;
  normalizedUnit: InventoryUnit | null;
  viaSubstitute: boolean;
  // Каталожная привязка строки — чтобы предложить «добавить на склад» прямо из
  // панели матча. Для кастомных ингредиентов автора (чужой склад) — null.
  ingredientCatalogItemId: string | null;
  userCustomIngredientId: string | null;
  // Предзаполнение поля «добавить на склад»: нехватка в человеческой единице
  // (кг/г/пак). null для покрытых строк и там, где перевод не удался.
  suggestedAddQuantity: number | null;
  suggestedAddUnit: InventoryUnit | null;
};

export type RecipeMatchLabel = "ready" | "almost" | "partial" | "none";

export type RecipeMatchDto = {
  recipeId: string;
  matchPercent: number;
  label: RecipeMatchLabel;
  totalLines: number;
  coveredLines: number;
  missingCount: number;
  lines: RecipeMatchLineDto[];
  targetBatchVolumeL: number;
  recipeBatchVolumeL: number;
  scaledToInventory: boolean;
};

// Элемент списка «рецепты под ваш склад» (обратный матчинг от инвентаря).
export type BrewableRecipeDto = {
  recipeId: string;
  slug: string;
  title: string;
  matchPercent: number;
  label: RecipeMatchLabel;
  totalLines: number;
  coveredLines: number;
  missingCount: number;
};
