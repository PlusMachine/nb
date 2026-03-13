"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { parseMoneyInputToMinor } from "@/features/system/money";
import { upsertSystemCurrencyRates } from "@/features/system/currency-rates";
import { requireRole } from "@/lib/auth";

export const updateCurrencySettingsAction = async (formData: FormData) => {
  await requireRole("admin");

  const usdRubMinorPerUnit = parseMoneyInputToMinor(formData.get("usdRubRate"));
  const eurRubMinorPerUnit = parseMoneyInputToMinor(formData.get("eurRubRate"));

  if (usdRubMinorPerUnit == null || usdRubMinorPerUnit <= 0) {
    throw new Error("USD rate is required");
  }

  if (eurRubMinorPerUnit == null || eurRubMinorPerUnit <= 0) {
    throw new Error("EUR rate is required");
  }

  await upsertSystemCurrencyRates({
    RUB: 100,
    USD: usdRubMinorPerUnit,
    EUR: eurRubMinorPerUnit
  });

  revalidatePath("/admin/settings/currency");
  revalidatePath("/app/ingredients");
  redirect("/admin/settings/currency");
};
