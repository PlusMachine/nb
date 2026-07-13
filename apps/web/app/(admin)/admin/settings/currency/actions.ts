"use server";

import { revalidatePath } from "next/cache";

import { recordAuditEvent } from "@/features/audit/service";
import { formatMoneyInputValueFromMinor, parseMoneyInputToMinor } from "@/features/system/money";
import { listSystemCurrencyRates, upsertSystemCurrencyRates } from "@/features/system/currency-rates";
import { requireRole } from "@/lib/auth";

export type CurrencySettingsActionResult = { ok: true } | { ok: false; error: string };

const mapCurrencySettingsError = (error: unknown): { ok: false; error: string } => {
  // requireRole делает redirect для гостя/недостаточной роли — проглотить его
  // нельзя, иначе действие молча ничего не сделает.
  if (error instanceof Error) {
    const digest = (error as Error & { digest?: unknown }).digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  }

  return { ok: false, error: "Не удалось сохранить курсы." };
};

export const updateCurrencySettingsAction = async (input: {
  usdRubRate: string;
  eurRubRate: string;
}): Promise<CurrencySettingsActionResult> => {
  try {
    const user = await requireRole("admin");

    const usdRubMinorPerUnit = parseMoneyInputToMinor(input.usdRubRate);
    if (usdRubMinorPerUnit == null || usdRubMinorPerUnit <= 0) {
      return { ok: false, error: "Курс USD → RUB должен быть больше нуля." };
    }

    const eurRubMinorPerUnit = parseMoneyInputToMinor(input.eurRubRate);
    if (eurRubMinorPerUnit == null || eurRubMinorPerUnit <= 0) {
      return { ok: false, error: "Курс EUR → RUB должен быть больше нуля." };
    }

    const previous = await listSystemCurrencyRates();

    await upsertSystemCurrencyRates({
      RUB: 100,
      USD: usdRubMinorPerUnit,
      EUR: eurRubMinorPerUnit
    });

    await recordAuditEvent({
      actorUserId: user.id,
      actorEmail: user.email,
      action: "currency.update",
      entityType: "currency_rates",
      summary: `USD → RUB: ${formatMoneyInputValueFromMinor(usdRubMinorPerUnit)}, EUR → RUB: ${formatMoneyInputValueFromMinor(eurRubMinorPerUnit)}`,
      payload: {
        previous: { USD: previous.USD, EUR: previous.EUR },
        next: { USD: usdRubMinorPerUnit, EUR: eurRubMinorPerUnit }
      }
    });

    revalidatePath("/admin/settings/currency");
    revalidatePath("/app/ingredients");
    return { ok: true };
  } catch (error) {
    return mapCurrencySettingsError(error);
  }
};
