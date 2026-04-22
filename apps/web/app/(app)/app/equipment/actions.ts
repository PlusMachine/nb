"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createEquipmentProfile,
  deleteEquipmentProfile,
  duplicateEquipmentProfile,
  getEquipmentProfile,
  setDefaultEquipmentProfile,
  updateEquipmentProfile
} from "@/features/equipment-profiles/service";
import { requireUser } from "@/lib/auth";

const numberValue = (formData: FormData, key: string) => Number(formData.get(key) ?? 0);

const optionalNumberValue = (formData: FormData, key: string) => {
  const raw = String(formData.get(key) ?? "").trim();
  return raw ? Number(raw) : null;
};

const stringValue = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

const buildEquipmentProfilePayload = (
  formData: FormData,
  preserved?: { mashEfficiencyPct: number | null | undefined }
) => ({
  name: stringValue(formData, "name"),
  brewMethod: formData.has("brewMethod")
    ? stringValue(formData, "brewMethod")
    : "mash_sparge_two_vessel",
  targetBatchVolumeL: numberValue(formData, "targetBatchVolumeL"),
  boilTimeMin: numberValue(formData, "boilTimeMin"),
  brewhouseEfficiencyPct: numberValue(formData, "brewhouseEfficiencyPct"),
  mashEfficiencyPct: formData.has("mashEfficiencyPct")
    ? optionalNumberValue(formData, "mashEfficiencyPct")
    : preserved?.mashEfficiencyPct ?? null,
  evaporationRateLPerHr: numberValue(formData, "evaporationRateLPerHr"),
  trubChillerLossL: numberValue(formData, "trubChillerLossL"),
  fermenterLossL: numberValue(formData, "fermenterLossL"),
  mashTunDeadspaceL: formData.has("mashTunDeadspaceL") ? numberValue(formData, "mashTunDeadspaceL") : 0,
  spargeVesselDeadspaceL: formData.has("spargeVesselDeadspaceL") ? numberValue(formData, "spargeVesselDeadspaceL") : 0,
  grainAbsorptionLPerKg: numberValue(formData, "grainAbsorptionLPerKg"),
  coolingShrinkagePct: numberValue(formData, "coolingShrinkagePct"),
  topUpWaterL: formData.has("topUpWaterL") ? numberValue(formData, "topUpWaterL") : 0,
  mashThicknessLPerKg: numberValue(formData, "mashThicknessLPerKg"),
  maxMashVolumeL: optionalNumberValue(formData, "maxMashVolumeL"),
  maxKettleVolumeL: optionalNumberValue(formData, "maxKettleVolumeL"),
  hopUtilizationFactor: numberValue(formData, "hopUtilizationFactor"),
  altitudeM: numberValue(formData, "altitudeM"),
  notes: stringValue(formData, "notes") || null
});

const refreshEquipmentPaths = () => {
  revalidatePath("/app/equipment");
  revalidatePath("/app/recipes/new");
};

export const createEquipmentProfileAction = async (formData: FormData) => {
  const user = await requireUser();
  await createEquipmentProfile(user.id, buildEquipmentProfilePayload(formData));
  refreshEquipmentPaths();
  redirect("/app/equipment");
};

export const updateEquipmentProfileAction = async (profileId: string, formData: FormData) => {
  const user = await requireUser();
  const currentProfile = await getEquipmentProfile(user.id, profileId);
  await updateEquipmentProfile(user.id, profileId, buildEquipmentProfilePayload(formData, {
    mashEfficiencyPct: currentProfile.mashEfficiencyPct
  }));
  refreshEquipmentPaths();
  redirect("/app/equipment");
};

export const deleteEquipmentProfileAction = async (profileId: string) => {
  const user = await requireUser();
  await deleteEquipmentProfile(user.id, profileId);
  refreshEquipmentPaths();
  redirect("/app/equipment");
};

export const duplicateEquipmentProfileAction = async (profileId: string) => {
  const user = await requireUser();
  await duplicateEquipmentProfile(user.id, profileId);
  refreshEquipmentPaths();
  redirect("/app/equipment");
};

export const setDefaultEquipmentProfileAction = async (profileId: string) => {
  const user = await requireUser();
  await setDefaultEquipmentProfile(user.id, profileId);
  refreshEquipmentPaths();
  redirect("/app/equipment");
};
