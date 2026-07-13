import type { EquipmentProfileDto, EquipmentProfileSnapshot } from "./contracts";

/**
 * Слепок профиля оборудования (иммутабельная копия на момент привязки). Живёт в
 * рецепте (`recipes.equipment_profile_snapshot`) и в партии
 * (`brew_batches.equipment_profile_snapshot`): правка профиля задним числом не
 * должна менять уже сохранённый рецепт и уже начатую варку.
 *
 * Чистая функция без импортов БД — client-safe (см. ловушку «клиент тянет @nb/db»).
 */
export const buildEquipmentProfileSnapshotFromDto = (profile: EquipmentProfileDto): EquipmentProfileSnapshot => ({
  id: profile.id,
  name: profile.name,
  targetBatchVolumeL: profile.targetBatchVolumeL,
  brewhouseEfficiencyPct: profile.brewhouseEfficiencyPct,
  evaporationRateLPerHr: profile.evaporationRateLPerHr,
  trubChillerLossL: profile.trubChillerLossL,
  fermenterLossL: profile.fermenterLossL,
  grainAbsorptionLPerKg: profile.grainAbsorptionLPerKg,
  coolingShrinkagePct: profile.coolingShrinkagePct,
  mashThicknessLPerKg: profile.mashThicknessLPerKg,
  maxMashVolumeL: profile.maxMashVolumeL,
  maxKettleVolumeL: profile.maxKettleVolumeL,
  hopUtilizationFactor: profile.hopUtilizationFactor,
  altitudeM: profile.altitudeM,
  notes: profile.notes,
  snapshotAt: new Date().toISOString()
});
