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
  allowedSalts: z.array(z.string()).optional().default([]),
  allowedAcids: z.array(z.string()).optional().default([]),
  manualSaltAdditions: z.array(z.object({
    salt: z.string(),
    grams: numberField().min(0, "Количество соли не может быть меньше 0 г."),
    target: z.enum(recipeWaterManualSaltAdditionTargets).optional()
  })).optional().default([]),
  targetMashPh: numberField().min(4, "Целевой pH затора не может быть ниже 4.").max(7, "Целевой pH затора не может быть выше 7.").optional().nullable(),
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
  targetMashPh: 5.35,
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
