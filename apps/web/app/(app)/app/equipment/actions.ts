"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { EQUIPMENT_PROFILE_MAX_COUNT_PER_USER } from "@/features/equipment-profiles/contracts";
import {
  createEquipmentProfile,
  deleteEquipmentProfile,
  duplicateEquipmentProfile,
  setDefaultEquipmentProfile,
  updateEquipmentProfile
} from "@/features/equipment-profiles/service";
import { requireUser } from "@/lib/auth";

// Барьер сервиса бросает RATE_LIMITED / EQUIPMENT_PROFILE_QUOTA_REACHED — переводим
// их в понятные сообщения. NEXT_REDIRECT (успешный redirect + гейт requireUser для
// гостя/истёкшей сессии) пробрасываем как есть, всё остальное — наверх без изменений.
const rethrowEquipmentCreationError = (error: unknown): never => {
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
    if (error.message === "RATE_LIMITED") {
      throw new Error("Слишком много профилей подряд. Немного подождите.");
    }
    if (error.message === "EQUIPMENT_PROFILE_QUOTA_REACHED") {
      throw new Error(`Достигнут предел числа профилей оборудования (${EQUIPMENT_PROFILE_MAX_COUNT_PER_USER}). Удалите ненужные.`);
    }
  }

  throw error;
};

const numberValue = (formData: FormData, key: string) => Number(formData.get(key) ?? 0);

const optionalNumberValue = (formData: FormData, key: string) => {
  const raw = String(formData.get(key) ?? "").trim();
  return raw ? Number(raw) : null;
};

const stringValue = (formData: FormData, key: string) => String(formData.get(key) ?? "").trim();

const buildEquipmentProfilePayload = (formData: FormData) => ({
  name: stringValue(formData, "name"),
  targetBatchVolumeL: numberValue(formData, "targetBatchVolumeL"),
  brewhouseEfficiencyPct: numberValue(formData, "brewhouseEfficiencyPct"),
  evaporationRateLPerHr: numberValue(formData, "evaporationRateLPerHr"),
  trubChillerLossL: numberValue(formData, "trubChillerLossL"),
  fermenterLossL: numberValue(formData, "fermenterLossL"),
  grainAbsorptionLPerKg: numberValue(formData, "grainAbsorptionLPerKg"),
  coolingShrinkagePct: numberValue(formData, "coolingShrinkagePct"),
  mashThicknessLPerKg: numberValue(formData, "mashThicknessLPerKg"),
  mashTunDeadspaceL: numberValue(formData, "mashTunDeadspaceL"),
  minMashVolumeL: optionalNumberValue(formData, "minMashVolumeL"),
  maxGrainKg: optionalNumberValue(formData, "maxGrainKg"),
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
  try {
    const user = await requireUser();
    await createEquipmentProfile(user.id, buildEquipmentProfilePayload(formData));
    refreshEquipmentPaths();
    redirect("/app/equipment");
  } catch (error) {
    rethrowEquipmentCreationError(error);
  }
};

export const updateEquipmentProfileAction = async (profileId: string, formData: FormData) => {
  const user = await requireUser();
  await updateEquipmentProfile(user.id, profileId, buildEquipmentProfilePayload(formData));
  refreshEquipmentPaths();
  redirect("/app/equipment");
};

export const deleteEquipmentProfileAction = async (profileId: string): Promise<{ ok: boolean; message: string }> => {
  try {
    const user = await requireUser();
    await deleteEquipmentProfile(user.id, profileId);
    refreshEquipmentPaths();

    return { ok: true, message: "Профиль оборудования удален." };
  } catch (error) {
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { ok: false, message: "Профиль не найден или уже удален." };
    }

    return { ok: false, message: "Не удалось удалить профиль оборудования. Попробуйте еще раз." };
  }
};

export const duplicateEquipmentProfileAction = async (profileId: string) => {
  try {
    const user = await requireUser();
    await duplicateEquipmentProfile(user.id, profileId);
    refreshEquipmentPaths();
    redirect("/app/equipment");
  } catch (error) {
    rethrowEquipmentCreationError(error);
  }
};

export const setDefaultEquipmentProfileAction = async (profileId: string) => {
  const user = await requireUser();
  await setDefaultEquipmentProfile(user.id, profileId);
  refreshEquipmentPaths();
  redirect("/app/equipment");
};
