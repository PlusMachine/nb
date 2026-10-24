import { DEFAULT_EQUIPMENT_PROFILE_NAME, starterEquipmentProfileDefaults, type EquipmentProfilePayload } from "../equipment-profiles/contracts";

export const formatEquipmentProfileName = (index: number) => index === 1
  ? DEFAULT_EQUIPMENT_PROFILE_NAME
  : `${DEFAULT_EQUIPMENT_PROFILE_NAME} (${index})`;

export const buildNextEquipmentProfileName = (profiles: Array<{ name: string }>) => {
  const usedNames = new Set(profiles.map((profile) => profile.name.trim()));

  let nextIndex = 1;
  while (usedNames.has(formatEquipmentProfileName(nextIndex))) {
    nextIndex += 1;
  }

  return formatEquipmentProfileName(nextIndex);
};

export const equipmentProfileSaneDefaults: Partial<EquipmentProfilePayload> = {
  targetBatchVolumeL: 20,
  brewhouseEfficiencyPct: 70,
  evaporationRateLPerHr: 3,
  trubChillerLossL: 1,
  fermenterLossL: 0,
  grainAbsorptionLPerKg: 0.8,
  coolingShrinkagePct: 4,
  mashThicknessLPerKg: 3,
  mashTunDeadspaceL: 0,
  minMashVolumeL: null,
  maxGrainKg: null,
  maxMashVolumeL: null,
  maxKettleVolumeL: null,
  hopUtilizationFactor: 1,
  altitudeM: 0
};

export const buildStarterEquipmentProfileDefaults = (
  name = formatEquipmentProfileName(1)
): EquipmentProfilePayload => ({
  ...starterEquipmentProfileDefaults,
  name,
  ...equipmentProfileSaneDefaults
});
