import type { EquipmentProfilePayload, EquipmentProfileSnapshot } from "../equipment-profiles/contracts";
import { calculateEquipmentVolumePlan } from "../equipment-profiles/volume-plan";

export const buildEquipmentProfileSummarySnapshot = (
  profile: EquipmentProfilePayload,
  id: string | null = null
): EquipmentProfileSnapshot => ({
  ...profile,
  id,
  snapshotAt: "1970-01-01T00:00:00.000Z"
});

export const buildEquipmentProfileVolumeSummary = (
  profile: EquipmentProfilePayload,
  grainKg = 5
) => calculateEquipmentVolumePlan(buildEquipmentProfileSummarySnapshot(profile), grainKg);
