"use server";

import { redirect } from "next/navigation";

import { resolvePreferredGravityUnit } from "@/features/system/gravity-units";
import { resolvePreferredCurrency } from "@/features/system/money";
import { updateCurrentProfile } from "@/lib/auth";

export const updateSettingsAction = async (formData: FormData) => {
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (displayName.length < 2) {
    throw new Error("Display name too short");
  }
  await updateCurrentProfile({
    displayName,
    preferredCurrency: resolvePreferredCurrency(formData.get("preferredCurrency")),
    preferredGravityUnit: resolvePreferredGravityUnit(formData.get("preferredGravityUnit"))
  });
  redirect("/profile");
};
