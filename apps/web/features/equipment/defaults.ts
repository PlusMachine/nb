import { starterEquipmentProfileDefaults, type EquipmentProfilePayload } from "../equipment-profiles/contracts";

const profileNamePattern = /^Профиль оборудования (?:\((\d+)\)|(\d+))$/;

export const formatEquipmentProfileName = (index: number) => `Профиль оборудования (${index})`;

export const buildNextEquipmentProfileName = (profiles: Array<{ name: string }>) => {
  const usedIndexes = new Set<number>();

  for (const profile of profiles) {
    const match = profile.name.match(profileNamePattern);
    const rawIndex = match?.[1] ?? match?.[2];
    const index = rawIndex ? Number.parseInt(rawIndex, 10) : NaN;

    if (Number.isInteger(index) && index > 0) {
      usedIndexes.add(index);
    }
  }

  let nextIndex = 1;
  while (usedIndexes.has(nextIndex)) {
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
