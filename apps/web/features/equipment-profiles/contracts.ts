import { z } from "zod";

const optionalNonNegativeNumber = z.coerce.number().min(0).optional().nullable();

/** Дефолт скорости выпаривания стартового профиля оборудования, л/ч. Используется и как
 *  fallback при расчёте preBoilVolumeL для рецептов без привязанного профиля оборудования. */
export const DEFAULT_EVAPORATION_RATE_L_PER_HR = 3;

/** Дефолт эффективности затирания (brewhouse efficiency), %. Реальные домашние варки —
 *  65–72%; используется и как zod-дефолт профиля оборудования, и как дефолт эффективности
 *  рецепта без привязанного профиля (features/recipes/service.ts, recipe-designer/helpers.ts). */
export const DEFAULT_BREWHOUSE_EFFICIENCY_PCT = 70;

/**
 * Анти-абьюз: щедрый потолок числа профилей оборудования на пользователя. Даже у
 * энтузиаста с несколькими системами их единицы — упереться реальному пивовару
 * невозможно, ловит только массовое засорение ботом. Считаются все пути создания
 * (createEquipmentProfile и дублирование, которое зовёт его). Плюс rate limit на
 * частоту создания.
 */
export const EQUIPMENT_PROFILE_MAX_COUNT_PER_USER = 50;
export const EQUIPMENT_PROFILE_CREATE_RATE_LIMIT = 20;
export const EQUIPMENT_PROFILE_CREATE_RATE_WINDOW_SECONDS = 60 * 60;

export const equipmentProfilePayloadSchema = z.object({
  name: z.string().trim().min(1).max(180),
  targetBatchVolumeL: z.coerce.number().positive(),
  brewhouseEfficiencyPct: z.coerce.number().positive().max(100).default(DEFAULT_BREWHOUSE_EFFICIENCY_PCT),
  evaporationRateLPerHr: z.coerce.number().min(0).default(DEFAULT_EVAPORATION_RATE_L_PER_HR),
  trubChillerLossL: z.coerce.number().min(0).default(0),
  fermenterLossL: z.coerce.number().min(0).default(0),
  grainAbsorptionLPerKg: z.coerce.number().min(0).default(0.75),
  coolingShrinkagePct: z.coerce.number().min(0).max(20).default(4),
  mashThicknessLPerKg: z.coerce.number().positive().default(3),
  mashTunDeadspaceL: z.coerce.number().min(0).default(0),
  minMashVolumeL: optionalNonNegativeNumber,
  maxMashVolumeL: optionalNonNegativeNumber,
  maxGrainKg: optionalNonNegativeNumber,
  maxKettleVolumeL: optionalNonNegativeNumber,
  hopUtilizationFactor: z.coerce.number().positive().default(1),
  altitudeM: z.coerce.number().min(-500).max(9000).default(0),
  notes: z.string().trim().max(6000).optional().nullable()
});

export const updateEquipmentProfilePayloadSchema = equipmentProfilePayloadSchema.partial();

export const equipmentProfileSnapshotSchema = equipmentProfilePayloadSchema.extend({
  id: z.string().uuid().nullable(),
  snapshotAt: z.string().datetime()
});

export type EquipmentProfilePayload = z.infer<typeof equipmentProfilePayloadSchema>;
export type UpdateEquipmentProfilePayload = z.infer<typeof updateEquipmentProfilePayloadSchema>;
export type EquipmentProfileSnapshot = z.infer<typeof equipmentProfileSnapshotSchema>;

export type EquipmentProfileDto = EquipmentProfilePayload & {
  id: string;
  userId: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export const starterEquipmentProfileDefaults: EquipmentProfilePayload = {
  name: "Профиль оборудования (1)",
  targetBatchVolumeL: 20,
  brewhouseEfficiencyPct: DEFAULT_BREWHOUSE_EFFICIENCY_PCT,
  evaporationRateLPerHr: DEFAULT_EVAPORATION_RATE_L_PER_HR,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  grainAbsorptionLPerKg: 0.8,
  coolingShrinkagePct: 4,
  mashThicknessLPerKg: 3,
  mashTunDeadspaceL: 0,
  minMashVolumeL: null,
  maxMashVolumeL: null,
  maxGrainKg: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0,
  notes: null
};
